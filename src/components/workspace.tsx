"use client";

import { useCallback, useEffect, useState } from "react";
import { useChat } from "@/hooks/use-chat";
import { useDocuments } from "@/hooks/use-documents";
import type { OpenPassage } from "./answer";
import { ChatPanel } from "./chat-panel";
import { DocumentLibrary } from "./document-library";
import { LibraryIcon, PlusIcon } from "./icons";
import { PassageDrawer } from "./passage-drawer";
import { ThemeToggle } from "./theme-toggle";

type AnswerMode = "claude" | "mock" | "unconfigured";

export function Workspace() {
  const library = useDocuments();
  const chat = useChat();
  const [passage, setPassage] = useState<OpenPassage | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [mode, setMode] = useState<{ answerMode: AnswerMode; model: string } | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : null))
      .then(setMode)
      .catch(() => undefined);
  }, []);

  const closePassage = useCallback(() => setPassage(null), []);
  const hasDocuments = library.documents?.some((d) => d.status === "ready") ?? false;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setLibraryOpen((open) => !open)}
          aria-label="Toggle document library"
          className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 md:hidden dark:hover:bg-zinc-800"
        >
          <LibraryIcon />
        </button>
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-600 text-sm text-white">
            D
          </span>
          DocuMind
        </span>
        {mode && <ModeBadge {...mode} />}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              chat.reset();
              setPassage(null);
            }}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <PlusIcon /> New chat
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <aside
          className={`${libraryOpen ? "absolute inset-0 z-10 flex" : "hidden"} w-full flex-col border-r border-zinc-200 bg-zinc-50 md:static md:flex md:w-80 dark:border-zinc-800 dark:bg-zinc-950`}
        >
          <DocumentLibrary
            documents={library.documents}
            error={library.error}
            onUpload={library.upload}
            onRemove={library.remove}
          />
        </aside>
        <main className="min-w-0 flex-1">
          <ChatPanel
            messages={chat.messages}
            busy={chat.busy}
            hasDocuments={hasDocuments}
            onAsk={chat.ask}
            onStop={chat.stop}
            onOpenPassage={setPassage}
          />
        </main>
        {passage && <PassageDrawer passage={passage} onClose={closePassage} />}
      </div>
    </div>
  );
}

function ModeBadge({ answerMode, model }: { answerMode: AnswerMode; model: string }) {
  const styles: Record<AnswerMode, [string, string]> = {
    claude: [model, "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"],
    mock: ["mock answers", "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"],
    unconfigured: [
      "no API key - retrieval only",
      "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
    ],
  };
  const [label, className] = styles[answerMode];
  return (
    <span
      className={`hidden rounded-full px-2 py-0.5 font-mono text-[11px] sm:inline ${className}`}
    >
      {label}
    </span>
  );
}
