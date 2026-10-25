"use client";

import { REFUSAL_NOTICE } from "@/domain/answer";
import type { ChatMessage } from "@/hooks/use-chat";
import { citedSources } from "@/lib/highlight";
import { SearchOffIcon } from "./icons";

export interface OpenPassage {
  chunkId: string;
  source: number;
  citedText?: string;
}

type Props = {
  message: Extract<ChatMessage, { role: "assistant" }>;
  onOpenPassage: (passage: OpenPassage) => void;
};

export function Answer({ message, onOpenPassage }: Props) {
  const { segments, sources, status, stopReason, error } = message;
  const hasText = segments.some((s) => s.text.trim());

  if (stopReason === "no_context") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        <SearchOffIcon className="mt-0.5 size-4" />
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            No answer found in your documents
          </p>
          <p>
            Nothing in the library is relevant enough to answer this. Try rephrasing, or upload a
            document that covers it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="answer">
      {stopReason === "refusal" ? (
        <p className="text-sm text-zinc-500 italic">{REFUSAL_NOTICE}</p>
      ) : (
        <div className="text-[15px] leading-7 whitespace-pre-wrap">
          {segments.map((segment, i) => (
            <span key={i}>
              {segment.text}
              {citedSources(segment.citations).map((c) => (
                <button
                  key={c.source}
                  type="button"
                  onClick={() =>
                    onOpenPassage({ chunkId: c.chunkId, source: c.source, citedText: c.citedText })
                  }
                  title={c.citedText}
                  aria-label={`Open source ${c.source}`}
                  className="mx-0.5 inline-flex h-5 min-w-5 -translate-y-px items-center justify-center rounded bg-indigo-100 px-1 align-middle font-mono text-[11px] font-semibold text-indigo-700 hover:bg-indigo-600 hover:text-white dark:bg-indigo-500/20 dark:text-indigo-300"
                >
                  {c.source}
                </button>
              ))}
            </span>
          ))}
          {status === "streaming" && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo-500 align-middle" />
          )}
        </div>
      )}

      {status === "streaming" && !hasText && (
        <p className="text-sm text-zinc-500">
          {sources.length ? `Reading ${sources.length} passages...` : "Searching your documents..."}
        </p>
      )}
      {stopReason === "max_tokens" && (
        <p className="text-xs text-amber-600">
          The answer was cut off because it reached the length limit.
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error ?? "Something went wrong."}
        </p>
      )}

      {sources.length > 0 && hasText && stopReason !== "refusal" && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {sources.map((s) => (
            <button
              key={s.chunkId}
              type="button"
              onClick={() => onOpenPassage({ chunkId: s.chunkId, source: s.index })}
              className="flex max-w-64 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-600 hover:border-indigo-400 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                {s.index}
              </span>
              <span className="truncate">
                {[s.documentTitle, s.heading?.split(" › ").at(-1)].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
