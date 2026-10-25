"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ChatMessage } from "@/hooks/use-chat";
import { Answer, type OpenPassage } from "./answer";
import { SendIcon, StopIcon } from "./icons";

const SUGGESTIONS = [
  "How many vacation days do full-time employees get?",
  "Can Beacon connect to a 5 GHz Wi-Fi network?",
  "How quickly must a phishing click be reported?",
];

interface Props {
  messages: ChatMessage[];
  busy: boolean;
  hasDocuments: boolean;
  onAsk: (question: string) => void;
  onStop: () => void;
  onOpenPassage: (passage: OpenPassage) => void;
}

export function ChatPanel({ messages, busy, hasDocuments, onAsk, onStop, onOpenPassage }: Props) {
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const question = draft.trim();
    if (!question || busy) return;
    setDraft("");
    onAsk(question);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) submit(event);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
          {messages.length === 0 && (
            <div className="mt-[12vh] text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Ask your documents</h1>
              <p className="mt-2 text-sm text-zinc-500">
                Every answer links to the exact passage it came from - and says so when the answer
                isn&apos;t there.
              </p>
              {hasDocuments && (
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onAsk(s)}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:border-indigo-400 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {messages.map((m) =>
            m.role === "user" ? (
              <p
                key={m.id}
                className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-[15px] whitespace-pre-wrap text-white"
              >
                {m.text}
              </p>
            ) : (
              <Answer key={m.id} message={m} onOpenPassage={onOpenPassage} />
            ),
          )}
          <div ref={bottom} />
        </div>
      </div>

      <form
        onSubmit={submit}
        className="border-t border-zinc-200 bg-zinc-50/80 p-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-zinc-300 bg-white p-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={2000}
            placeholder={
              hasDocuments
                ? "Ask a question about your documents..."
                : "Upload a document to get started"
            }
            aria-label="Question"
            className="[field-sizing:content] max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-zinc-400"
          />
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              className="rounded-lg bg-zinc-200 p-2.5 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send question"
              className="rounded-lg bg-indigo-600 p-2.5 text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
