import { applyAnswerEvent, NO_ANSWER, REFUSAL_NOTICE, segmentsToText } from "@/domain/answer";
import { NotFoundError } from "@/domain/errors";
import type {
  AnswerProvider,
  AnswerSegment,
  ChatEvent,
  ChatTurn,
  Source,
  StopReason,
} from "@/domain/types";
import type { ConversationsRepository } from "@/infra/db/conversations-repo";
import type { RetrievalResult, RetrievalService } from "./retrieval";

export interface AskInput {
  question: string;
  conversationId?: string;
}

type Conversations = Pick<
  ConversationsRepository,
  "create" | "exists" | "addMessage" | "recentTurns"
>;

/** Previous messages sent along for follow-up questions ("and for contractors?"). */
const HISTORY_MESSAGES = 6;

export class ChatService {
  constructor(
    private readonly retrieval: Pick<RetrievalService, "search">,
    private readonly conversations: Conversations,
    private readonly provider: AnswerProvider,
  ) {}

  /**
   * Resolves the conversation and retrieves sources up front, so missing conversations and
   * database failures surface as normal HTTP errors; only the answer itself is streamed.
   */
  async ask(input: AskInput, signal?: AbortSignal): Promise<AsyncGenerator<ChatEvent>> {
    const conversationId =
      input.conversationId ?? (await this.conversations.create(input.question));
    if (input.conversationId && !(await this.conversations.exists(input.conversationId))) {
      throw new NotFoundError(`Conversation ${input.conversationId} does not exist.`);
    }
    const history = await this.conversations.recentTurns(conversationId, HISTORY_MESSAGES);
    await this.conversations.addMessage(conversationId, "user", input.question);
    const retrieval = await this.retrieval.search(input.question);
    return this.answer(conversationId, input.question, history, retrieval, signal);
  }

  private async *answer(
    conversationId: string,
    question: string,
    history: ChatTurn[],
    { sources, weak }: RetrievalResult,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatEvent> {
    const cited: Source[] = weak ? [] : sources;
    yield {
      type: "start",
      conversationId,
      sources: cited.map(({ index, id, documentId, documentTitle, heading }) => ({
        index,
        chunkId: id,
        documentId,
        documentTitle,
        heading,
      })),
    };

    // Weak retrieval: answer "not found" without spending an LLM call on irrelevant context.
    if (weak) {
      yield { type: "text", segment: 0, text: NO_ANSWER };
      yield { type: "end", stopReason: "no_context" };
      await this.save(conversationId, [{ text: NO_ANSWER, citations: [] }], "no_context");
      return;
    }

    let segments: AnswerSegment[] = [];
    let stopReason: StopReason = "other";
    try {
      for await (const event of this.provider.stream({ question, history, sources }, signal)) {
        segments = applyAnswerEvent(segments, event);
        if (event.type === "end") stopReason = event.stopReason;
        yield event;
      }
    } catch (error) {
      if (signal?.aborted) return;
      console.error("Answer stream failed:", error);
      yield {
        type: "error",
        message: (error as Error).message || "The answer could not be generated.",
      };
      return;
    }
    await this.save(conversationId, segments, stopReason);
  }

  private async save(conversationId: string, segments: AnswerSegment[], stopReason: StopReason) {
    // A refused answer may be partial; store the notice rather than the fragment.
    const kept = stopReason === "refusal" ? [{ text: REFUSAL_NOTICE, citations: [] }] : segments;
    await this.conversations.addMessage(conversationId, "assistant", segmentsToText(kept), kept);
  }
}
