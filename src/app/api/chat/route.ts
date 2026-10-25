import { getContainer } from "@/container";
import type { ChatEvent } from "@/domain/types";
import { handle, parseOrThrow, readJson } from "@/lib/http";
import { chatRequestSchema } from "@/lib/schemas";

/** Streams the answer as NDJSON: one `ChatEvent` per line. */
export const POST = handle(async (request: Request) => {
  const input = parseOrThrow(chatRequestSchema, await readJson(request), "request body");
  const events = await getContainer().chat().ask(input, request.signal);
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const { value, done } = await events.next();
        if (done) controller.close();
        else send(value);
      } catch (error) {
        console.error("Chat stream failed:", error);
        send({ type: "error", message: "The answer stream failed." });
        controller.close();
      }
    },
    async cancel() {
      await events.return(undefined);
    },
  });
  return new Response(body, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
});
