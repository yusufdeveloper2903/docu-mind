import { describe, expect, it } from "vitest";
import { chunkDocument, splitMarkdownSections } from "@/services/chunker";

const sentence = (n: number) => `Sentence number ${n} has a few words in it.`;
const paragraph = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => sentence(from + i)).join(" ");

describe("splitMarkdownSections", () => {
  it("tracks the heading path and resets it when a higher-level heading starts", () => {
    const sections = splitMarkdownSections(
      [
        "# Handbook",
        "Intro.",
        "## Leave",
        "### Vacation",
        "28 days.",
        "## Equipment",
        "Laptops.",
      ].join("\n"),
    );
    expect(sections).toEqual([
      { heading: "Handbook", body: "Intro." },
      { heading: "Handbook › Leave › Vacation", body: "28 days." },
      { heading: "Handbook › Equipment", body: "Laptops." },
    ]);
  });

  it("ignores heading-like lines inside fenced code blocks", () => {
    const sections = splitMarkdownSections("## Setup\n```sh\n# not a heading\nnpm i\n```");
    expect(sections).toHaveLength(1);
    expect(sections[0]!.body).toContain("# not a heading");
  });

  it("drops headings without body text and keeps text before the first heading", () => {
    expect(splitMarkdownSections("Preface.\n# Empty\n# Full\nBody.")).toEqual([
      { heading: null, body: "Preface." },
      { heading: "Full", body: "Body." },
    ]);
  });
});

describe("chunkDocument", () => {
  const options = { maxChars: 200, overlapChars: 60 };

  it("keeps a small section in one chunk with its heading", () => {
    const chunks = chunkDocument(
      "# FAQ\n## Battery\nIt lasts 14 days.\n\nCharging takes 3 hours.",
      "markdown",
    );
    expect(chunks).toEqual([
      {
        ordinal: 0,
        heading: "FAQ › Battery",
        content: "It lasts 14 days.\n\nCharging takes 3 hours.",
      },
    ]);
  });

  it("never lets a chunk straddle two sections", () => {
    const chunks = chunkDocument("# A\nAlpha text.\n# B\nBeta text.", "markdown", options);
    expect(chunks.map((c) => [c.heading, c.content])).toEqual([
      ["A", "Alpha text."],
      ["B", "Beta text."],
    ]);
  });

  it("packs whole paragraphs up to the size limit and repeats whole trailing sentences as overlap", () => {
    const text = [paragraph(1, 2), paragraph(3, 2), paragraph(5, 2)].join("\n\n");
    const chunks = chunkDocument(text, "text", options);

    expect(chunks.length).toBeGreaterThan(1);
    for (const [i, chunk] of chunks.entries()) {
      expect(chunk.ordinal).toBe(i);
      expect(chunk.heading).toBeNull();
    }
    // The next chunk starts with the last sentence of the previous one.
    const lastSentence = chunks[0]!.content.split(/(?<=\.)\s+/).at(-1)!;
    expect(chunks[1]!.content.startsWith(lastSentence)).toBe(true);
    // No sentence is lost.
    for (let n = 1; n <= 6; n++) {
      expect(chunks.some((c) => c.content.includes(sentence(n)))).toBe(true);
    }
  });

  it("splits an oversized paragraph at sentence boundaries", () => {
    const chunks = chunkDocument(paragraph(1, 12), "text", options);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(options.maxChars + options.overlapChars + 2);
      expect(chunk.content).toMatch(/\.$/);
    }
  });

  it("hard-wraps a single run-on sentence longer than a chunk at word boundaries", () => {
    const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkDocument(words, "text", { maxChars: 100, overlapChars: 0 });
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.map((c) => c.content).join(" ")).toBe(words);
  });

  it("treats Markdown syntax in plain text files as text", () => {
    expect(chunkDocument("# Not a heading\nBody", "text")[0]).toMatchObject({ heading: null });
  });

  it("returns nothing for blank input", () => {
    expect(chunkDocument("  \n\n ", "markdown")).toEqual([]);
  });
});
