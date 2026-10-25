import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "@/services/rrf";

describe("reciprocalRankFusion", () => {
  it("scores each item as the sum of 1 / (k + rank) over the lists it appears in", () => {
    const [top] = reciprocalRankFusion([["a", "b"], ["a"]], 60);
    expect(top).toEqual({ id: "a", score: 1 / 61 + 1 / 61, ranks: [1, 1] });
  });

  it("ranks an item found by both retrievers above one ranked first by only one", () => {
    const fused = reciprocalRankFusion([
      ["lexical-only", "both"],
      ["vector-only", "both"],
    ]);
    expect(fused.map((f) => f.id)).toEqual(["both", "lexical-only", "vector-only"]);
    expect(fused[0]!.ranks).toEqual([2, 2]);
    expect(fused[1]!.ranks).toEqual([1, null]);
  });

  it("ignores duplicate ids within one list", () => {
    const fused = reciprocalRankFusion([["a", "a", "b"]]);
    expect(fused.find((f) => f.id === "a")!.score).toBeCloseTo(1 / 61);
    expect(fused.find((f) => f.id === "b")!.ranks).toEqual([3]);
  });

  it("lets a smaller k reward top ranks more strongly", () => {
    const lists = [
      ["x", "y", "z"],
      ["z", "y", "x"],
    ];
    const gap = (k: number) => {
      const fused = reciprocalRankFusion([...lists, ["x"]], k);
      return fused[0]!.score - fused[1]!.score;
    };
    expect(gap(1)).toBeGreaterThan(gap(60));
  });

  it("returns an empty list for empty input", () => {
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });
});
