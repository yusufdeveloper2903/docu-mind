"use client";

import { useRef, useState, type DragEvent } from "react";
import type { DocumentRecord } from "@/domain/types";
import { FileIcon, TrashIcon, UploadIcon } from "./icons";

const ACCEPT = ".pdf,.md,.markdown,.txt";

interface Props {
  documents: DocumentRecord[] | null;
  error: string | null;
  onUpload: (files: File[]) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function DocumentLibrary({ documents, error, onUpload, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      await onUpload(files);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void upload([...event.dataTransfer.files]);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold">Documents</h2>
        <p className="text-xs text-zinc-500">Answers only use what is in this library.</p>
      </div>

      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center text-sm transition-colors ${
          dragging
            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
            : "border-zinc-300 hover:border-indigo-400 hover:bg-white dark:border-zinc-700 dark:hover:bg-zinc-900"
        }`}
      >
        <UploadIcon className="size-5 text-indigo-500" />
        <span className="font-medium">{uploading ? "Uploading..." : "Upload or drop files"}</span>
        <span className="text-xs text-zinc-500">PDF, Markdown or TXT</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        data-testid="file-input"
        className="hidden"
        onChange={(e) => {
          void upload([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <ul
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
        aria-label="Document library"
      >
        {documents === null && <li className="px-1 text-xs text-zinc-500">Loading...</li>}
        {documents?.length === 0 && (
          <li className="px-1 text-xs text-zinc-500">
            No documents yet. Upload a file, or run <code className="font-mono">npm run seed</code>.
          </li>
        )}
        {documents?.map((doc) => (
          <DocumentRow key={doc.id} document={doc} onRemove={() => onRemove(doc.id)} />
        ))}
      </ul>
    </div>
  );
}

function DocumentRow({
  document: doc,
  onRemove,
}: {
  document: DocumentRecord;
  onRemove: () => void;
}) {
  return (
    <li className="group flex items-start gap-2 rounded-md px-2 py-2 hover:bg-white dark:hover:bg-zinc-900">
      <FileIcon className="mt-0.5 size-4 text-zinc-400" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={doc.filename}>
          {doc.title}
        </p>
        <p className="text-xs text-zinc-500">
          <StatusBadge document={doc} /> · {formatSize(doc.sizeBytes)}
        </p>
        {doc.status === "failed" && doc.error && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{doc.error}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Delete ${doc.title}`}
        className="rounded p-1 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-red-600 focus:opacity-100"
      >
        <TrashIcon className="size-3.5" />
      </button>
    </li>
  );
}

function StatusBadge({ document: doc }: { document: DocumentRecord }) {
  if (doc.status === "processing") {
    return <span className="animate-pulse text-amber-600 dark:text-amber-400">Indexing...</span>;
  }
  if (doc.status === "failed")
    return <span className="text-red-600 dark:text-red-400">Failed</span>;
  return (
    <span className="text-emerald-600 dark:text-emerald-400">
      {doc.chunkCount} {doc.chunkCount === 1 ? "chunk" : "chunks"}
    </span>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
