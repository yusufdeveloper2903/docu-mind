/**
 * Splits `content` around the first occurrence of `quote`, so the cited passage can be wrapped in
 * <mark>. Whitespace differences are tolerated; returns null when the quote cannot be located.
 */
export function locateQuote(
  content: string,
  quote: string,
): { before: string; match: string; after: string } | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const match = new RegExp(escaped.join("\\s+")).exec(content);
  if (!match) return null;
  return {
    before: content.slice(0, match.index),
    match: match[0],
    after: content.slice(match.index + match[0].length),
  };
}

/** Distinct source numbers in first-cited order, e.g. citations to 2, 1, 2 -> [2, 1]. */
export function citedSources<T extends { source: number }>(citations: T[]): T[] {
  const seen = new Set<number>();
  return citations.filter((c) => !seen.has(c.source) && seen.add(c.source));
}
