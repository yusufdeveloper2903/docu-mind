"use client";

import { useCallback, useEffect, useState } from "react";
import type { DocumentRecord } from "@/domain/types";
import { problemMessage } from "@/lib/problem";

const POLL_MS = 1500;

/** The document library, polled while any document is still being ingested. */
export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      fetchDocuments().then((result) => {
        if ("documents" in result) setDocuments(result.documents);
        setError("error" in result ? result.error : null);
      }),
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const processing = documents?.some((d) => d.status === "processing") ?? false;
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [processing, refresh]);

  const upload = useCallback(async (files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append("file", file);
    const response = await fetch("/api/documents", { method: "POST", body: form });
    if (!response.ok) return setError(await problemMessage(response));
    const created: DocumentRecord[] = await response.json();
    setDocuments((current) => [...created, ...(current ?? [])]);
    setError(null);
  }, []);

  const remove = useCallback(async (id: string) => {
    const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) return setError(await problemMessage(response));
    setDocuments((current) => current?.filter((d) => d.id !== id) ?? null);
  }, []);

  return { documents, error, upload, remove };
}

async function fetchDocuments(): Promise<{ documents: DocumentRecord[] } | { error: string }> {
  try {
    const response = await fetch("/api/documents", { cache: "no-store" });
    if (!response.ok) return { error: await problemMessage(response) };
    return { documents: await response.json() };
  } catch {
    return { error: "Could not reach the server." };
  }
}
