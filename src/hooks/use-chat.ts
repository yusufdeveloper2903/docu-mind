"use client";

import { useCallback, useRef, useState } from "react";
import { applyAnswerEvent } from "@/domain/answer";
import type { AnswerSegment, ChatEvent, SourceSummary, StopReason } from "@/domain/types";
import { readNdjson } from "@/lib/ndjson";
import { problemMessage } from "@/lib/problem";

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      segments: AnswerSegment[];
      sources: SourceSummary[];
      status: "streaming" | "done" | "error";
      stopReason?: StopReason;
      error?: string;
    };

type AssistantMessage = Extract<ChatMessage, { role: "assistant" }>;

/** Sends questions to /api/chat and folds the streamed NDJSON events into the message list. */
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | undefined>(undefined);
  const controller = useRef<AbortController | null>(null);

  const ask = useCallback(async (question: string) => {
    const assistantId = crypto.randomUUID();
    const update = (patch: (m: AssistantMessage) => Partial<AssistantMessage>) =>
      setMessages((all) =>
        all.map((m) =>
          m.id === assistantId && m.role === "assistant" ? { ...m, ...patch(m) } : m,
        ),
      );

    setMessages((all) => [
      ...all,
      { id: crypto.randomUUID(), role: "user", text: question },
      { id: assistantId, role: "assistant", segments: [], sources: [], status: "streaming" },
    ]);
    setBusy(true);
    controller.current = new AbortController();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, conversationId: conversationId.current }),
        signal: controller.current.signal,
      });
      if (!response.ok || !response.body) {
        const error = await problemMessage(response);
        update(() => ({ status: "error", error }));
        return;
      }
      for await (const event of readNdjson<ChatEvent>(response.body)) {
        if (event.type === "start") {
          conversationId.current = event.conversationId;
          update(() => ({ sources: event.sources }));
        } else if (event.type === "error") {
          update(() => ({ status: "error", error: event.message }));
        } else if (event.type === "end") {
          update(() => ({ status: "done", stopReason: event.stopReason }));
        } else {
          update((m) => ({ segments: applyAnswerEvent(m.segments, event) }));
        }
      }
      // A stream that closes without an "end" event (e.g. server restart) is still finished.
      update((m) => (m.status === "streaming" ? { status: "done" } : {}));
    } catch (error) {
      if ((error as Error).name === "AbortError") update(() => ({ status: "done" }));
      else update(() => ({ status: "error", error: "The connection was interrupted." }));
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }, []);

  const stop = useCallback(() => controller.current?.abort(), []);

  const reset = useCallback(() => {
    controller.current?.abort();
    conversationId.current = undefined;
    setMessages([]);
  }, []);

  return { messages, busy, ask, stop, reset };
}
