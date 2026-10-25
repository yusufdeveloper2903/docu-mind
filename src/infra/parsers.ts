import type { DocumentFormat } from "@/domain/types";
import { UnsupportedDocumentError } from "@/domain/errors";

const FORMATS: Record<string, DocumentFormat> = {
  pdf: "pdf",
  md: "markdown",
  markdown: "markdown",
  txt: "text",
};

const MIME_TYPES: Record<DocumentFormat, string> = {
  pdf: "application/pdf",
  markdown: "text/markdown",
  text: "text/plain",
};

export const SUPPORTED_EXTENSIONS = Object.keys(FORMATS);

export function detectFormat(filename: string): DocumentFormat {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const format = FORMATS[extension];
  if (!format) {
    throw new UnsupportedDocumentError(
      `Unsupported file type ".${extension}". Upload ${SUPPORTED_EXTENSIONS.map((e) => "." + e).join(", ")}.`,
    );
  }
  return format;
}

export const mimeTypeFor = (format: DocumentFormat): string => MIME_TYPES[format];

/** Turns an uploaded file into plain text. PDF pages are separated by blank lines. */
export async function extractText(bytes: Uint8Array, format: DocumentFormat): Promise<string> {
  if (format !== "pdf") return new TextDecoder("utf-8").decode(bytes);
  const { extractText: extractPdfText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractPdfText(pdf, { mergePages: false });
  return text.map((page) => page.trim()).join("\n\n");
}

/** A readable title: the first Markdown H1 if there is one, else the filename without extension. */
export function deriveTitle(filename: string, text: string, format: DocumentFormat): string {
  const h1 = format === "markdown" ? /^#\s+(.+)$/m.exec(text)?.[1]?.trim() : undefined;
  if (h1) return h1;
  const base = filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return base ? base[0]!.toUpperCase() + base.slice(1) : filename;
}
