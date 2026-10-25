import type { Source } from "@/domain/types";

export function makeSource(index: number, overrides: Partial<Source> = {}): Source {
  return {
    id: `00000000-0000-4000-8000-00000000000${index}`,
    documentId: "10000000-0000-4000-8000-000000000000",
    documentTitle: "Employee Handbook",
    ordinal: index - 1,
    heading: "Leave › Vacation",
    content: `Passage ${index} first paragraph.\n\nPassage ${index} second paragraph.`,
    index,
    score: 1 / (60 + index),
    ...overrides,
  };
}

/** Collects every value of an async iterable. */
export async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}
