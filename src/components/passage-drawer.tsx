"use client";

import { useEffect, useState } from "react";
import type { Chunk } from "@/domain/types";
import { locateQuote } from "@/lib/highlight";
import { problemMessage } from "@/lib/problem";
import type { OpenPassage } from "./answer";
import { CloseIcon } from "./icons";

type State = { chunkId: string } & ({ chunk: Chunk } | { error: string });

/** Side panel with the full source passage behind a citation, the cited sentence highlighted. */
export function PassageDrawer({ passage, onClose }: { passage: OpenPassage; onClose: () => void }) {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/chunks/${passage.chunkId}`, { signal: controller.signal })
      .then(async (res) =>
        setState(
          res.ok
            ? { chunkId: passage.chunkId, chunk: await res.json() }
            : { chunkId: passage.chunkId, error: await problemMessage(res) },
        ),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [passage.chunkId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Ignore a response that belongs to a previously opened passage.
  const current = state?.chunkId === passage.chunkId ? state : null;
  const chunk = current && "chunk" in current ? current.chunk : null;
  const parts = chunk && passage.citedText ? locateQuote(chunk.content, passage.citedText) : null;

  return (
    <aside
      aria-label="Source passage"
      className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
    >
      <header className="flex items-start gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
        <span className="flex size-6 items-center justify-center rounded bg-indigo-600 font-mono text-xs font-semibold text-white">
          {passage.source}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{chunk?.documentTitle ?? "Loading..."}</p>
          {chunk?.heading && <p className="truncate text-xs text-zinc-500">{chunk.heading}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close source"
          className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <CloseIcon />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 text-sm leading-6 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
        {current && "error" in current && <p className="text-red-600">{current.error}</p>}
        {chunk &&
          (parts ? (
            <>
              {parts.before}
              <mark data-testid="cited-passage">{parts.match}</mark>
              {parts.after}
            </>
          ) : (
            chunk.content
          ))}
      </div>
      {chunk && (
        <footer className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800">
          Passage {chunk.ordinal + 1} of this document
        </footer>
      )}
    </aside>
  );
}
