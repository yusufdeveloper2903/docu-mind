/**
 * Offline evaluation against the sample corpus in `evals/corpus`.
 *
 *   npm run eval:retrieval   hit@k / MRR for lexical, vector and hybrid retrieval (no API key)
 *   npm run eval:answers     answer correctness + citation checks with Claude (needs ANTHROPIC_API_KEY)
 *
 * Runs in its own database (`<DATABASE_URL db>_eval`) so uploads in the dev database never skew results.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_DATABASE_URL } from "@/config";
import { getContainer, type Container } from "@/container";
import { applyAnswerEvent, NO_ANSWER, segmentsToText } from "@/domain/answer";
import type { AnswerSegment, Source } from "@/domain/types";
import { migrate } from "@/infra/db/migrate";
import { reciprocalRankFusion } from "@/services/rrf";
import { ingestCorpus } from "../scripts/corpus";
import { ensureDatabase, withDatabase } from "../scripts/database";

interface EvalCase {
  id: string;
  question: string;
  /** null for questions the corpus cannot answer. */
  document: string | null;
  /** A phrase that only occurs in the passage that answers the question. */
  evidence: string | null;
  mustInclude: string[];
}

const K_VALUES = [1, 3, 6] as const;
const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const containsEvidence = (content: string, evidence: string) =>
  normalise(content).includes(normalise(evidence));
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : "n/a");

async function setup(): Promise<{ container: Container; cases: EvalCase[] }> {
  // Must run before anything reads the (cached) config.
  const baseUrl = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  const url = withDatabase(baseUrl, `${new URL(baseUrl).pathname.slice(1)}_eval`);
  await ensureDatabase(url);
  process.env.DATABASE_URL = url;

  const container = getContainer();
  await migrate(container.pool);
  await ingestCorpus(container);
  const cases = JSON.parse(await readFile(path.join(import.meta.dirname, "cases.json"), "utf8"));
  return { container, cases };
}

/** 1-based rank of the first chunk containing the evidence, or null if it was not retrieved. */
async function evidenceRank(container: Container, ids: string[], evidence: string) {
  const chunks = new Map((await container.chunks.getMany(ids)).map((c) => [c.id, c]));
  const index = ids.findIndex((id) => containsEvidence(chunks.get(id)?.content ?? "", evidence));
  return index === -1 ? null : index + 1;
}

async function evalRetrieval({ container, cases }: { container: Container; cases: EvalCase[] }) {
  const answerable = cases.filter((c) => c.evidence);
  const strategies = ["lexical", "vector", "hybrid (RRF)"] as const;
  const ranks: Record<(typeof strategies)[number], (number | null)[]> = {
    lexical: [],
    vector: [],
    "hybrid (RRF)": [],
  };

  for (const c of answerable) {
    const embedding = await container.embedder.embedQuery(c.question);
    const lexical = (await container.chunks.lexicalSearch(c.question, 20)).map((h) => h.id);
    const vector = (await container.chunks.vectorSearch(embedding, 20)).map((h) => h.id);
    const hybrid = reciprocalRankFusion([lexical, vector]).map((f) => f.id);
    ranks.lexical.push(await evidenceRank(container, lexical, c.evidence!));
    ranks.vector.push(await evidenceRank(container, vector, c.evidence!));
    ranks["hybrid (RRF)"].push(await evidenceRank(container, hybrid, c.evidence!));
  }

  // The "no answer" gate: weak retrieval should flag exactly the out-of-scope questions.
  let gateCorrect = 0;
  for (const c of cases) {
    const { weak } = await container.retrieval.search(c.question);
    if (weak === (c.evidence === null)) gateCorrect++;
    else console.warn(`  gate miss: ${c.id} (weak=${weak})`);
  }

  const rows = strategies.map((name) => {
    const r = ranks[name];
    const hits = Object.fromEntries(
      K_VALUES.map((k) => [
        `hit@${k}`,
        pct(r.filter((x) => x !== null && x <= k).length, r.length),
      ]),
    );
    const mrr = r.reduce<number>((sum, x) => sum + (x ? 1 / x : 0), 0) / r.length;
    return { strategy: name, ...hits, MRR: mrr.toFixed(3) };
  });
  console.table(rows);
  console.log(`No-answer gate: ${gateCorrect}/${cases.length} questions classified correctly.`);
  return { cases: answerable.length, rows, gate: { correct: gateCorrect, total: cases.length } };
}

async function evalAnswers({ container, cases }: { container: Container; cases: EvalCase[] }) {
  const provider = container.answerProvider();
  const results = [];
  for (const c of cases) {
    const { sources, weak } = await container.retrieval.search(c.question);
    let segments: AnswerSegment[] = [];
    if (!weak) {
      for await (const event of provider.stream({ question: c.question, history: [], sources })) {
        segments = applyAnswerEvent(segments, event);
      }
    }
    const answer = weak ? NO_ANSWER : segmentsToText(segments);
    results.push({ id: c.id, answer, ...grade(c, answer, segments, sources) });
    console.log(
      `  ${c.id.padEnd(22)} ${results.at(-1)!.correct ? "ok " : "BAD"} ${answer.slice(0, 90)}`,
    );
  }

  const answerable = results.filter((_, i) => cases[i]!.evidence);
  const summary = {
    correct: pct(results.filter((r) => r.correct).length, results.length),
    citedWhenAnswering: pct(answerable.filter((r) => r.citations > 0).length, answerable.length),
    citationsValid: pct(
      results.reduce((n, r) => n + r.validCitations, 0),
      results.reduce((n, r) => n + r.citations, 0),
    ),
    citedEvidence: pct(answerable.filter((r) => r.citedEvidence).length, answerable.length),
  };
  console.table([summary]);
  return { model: container.config.CLAUDE_MODEL, summary, results };
}

/**
 * - correct: all expected facts appear (or, for out-of-scope questions, the exact no-answer reply)
 * - validCitations: the cited text really occurs in the chunk the citation was mapped to
 * - citedEvidence: at least one citation points at the passage that contains the answer
 */
function grade(c: EvalCase, answer: string, segments: AnswerSegment[], sources: Source[]) {
  const citations = segments.flatMap((s) => s.citations);
  const byId = new Map(sources.map((s) => [s.id, s]));
  const validCitations = citations.filter((cit) => {
    const chunk = byId.get(cit.chunkId);
    return chunk && containsEvidence(chunk.content, cit.citedText);
  }).length;
  const citedEvidence =
    c.evidence !== null &&
    citations.some((cit) => containsEvidence(byId.get(cit.chunkId)?.content ?? "", c.evidence!));
  const correct =
    c.evidence === null
      ? answer.trim() === NO_ANSWER
      : c.mustInclude.every((fact) => normalise(answer).includes(normalise(fact)));
  return { correct, citations: citations.length, validCitations, citedEvidence };
}

const mode = process.argv[2];
if (mode !== "retrieval" && mode !== "answers") {
  console.error("Usage: tsx evals/run.ts <retrieval|answers>");
  process.exit(1);
}
const ctx = await setup();
try {
  const report = mode === "retrieval" ? await evalRetrieval(ctx) : await evalAnswers(ctx);
  const dir = path.join(import.meta.dirname, "results");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${mode}.json`), JSON.stringify(report, null, 2) + "\n");
} finally {
  await ctx.container.pool.end();
}
