export interface FusedResult {
  id: string;
  score: number;
  /** 1-based rank of the item in each input list, or null where it did not appear. */
  ranks: (number | null)[];
}

/**
 * Reciprocal Rank Fusion (Cormack et al., 2009): score(d) = Σ 1 / (k + rank_i(d)).
 * It only looks at ranks, so BM25-style text scores and cosine similarities never need to be
 * normalised onto a common scale. k = 60 is the constant from the paper; larger values flatten
 * the advantage of top-ranked items.
 */
export function reciprocalRankFusion(rankings: string[][], k = 60): FusedResult[] {
  const fused = new Map<string, FusedResult>();
  rankings.forEach((ranking, listIndex) => {
    ranking.forEach((id, position) => {
      const entry = fused.get(id) ?? { id, score: 0, ranks: rankings.map(() => null) };
      if (entry.ranks[listIndex] !== null) return; // ignore duplicates within one list
      entry.ranks[listIndex] = position + 1;
      entry.score += 1 / (k + position + 1);
      fused.set(id, entry);
    });
  });
  // Ties keep the order of first appearance, which favours the earlier (lexical) list.
  return [...fused.values()].sort((a, b) => b.score - a.score);
}
