import { describe, expect, it } from "vitest";
import { UnsupportedDocumentError } from "@/domain/errors";
import { detectFormat, extractText } from "@/infra/parsers";

/** Builds a minimal valid PDF with one text line per page (offsets computed for the xref table). */
function makePdf(pages: string[]): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const [i, text] of pages.entries()) {
    const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

describe("parsers", () => {
  it("detects formats from the extension, case-insensitively", () => {
    expect(detectFormat("Report.PDF")).toBe("pdf");
    expect(detectFormat("notes.markdown")).toBe("markdown");
    expect(detectFormat("a.b.txt")).toBe("text");
    expect(() => detectFormat("archive.zip")).toThrow(UnsupportedDocumentError);
    expect(() => detectFormat("README")).toThrow(UnsupportedDocumentError);
  });

  it("extracts PDF text page by page, separated by blank lines", async () => {
    const text = await extractText(
      makePdf(["Vacation is 28 days.", "Parental leave is 16 weeks."]),
      "pdf",
    );
    expect(text).toBe("Vacation is 28 days.\n\nParental leave is 16 weeks.");
  });

  it("decodes text files as UTF-8", async () => {
    expect(await extractText(new TextEncoder().encode("Größe: 5 €"), "text")).toBe("Größe: 5 €");
  });
});
