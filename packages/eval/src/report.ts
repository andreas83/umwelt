import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readJsonl } from './jsonl.js';
import type { GenerationRecord, JudgmentRecord } from './records.js';
import type { RunDir } from './run-dir.js';
import { mean, quantile, rate } from './stats.js';

const AXES = ['political', 'religious', 'sexual'] as const;
const NEUTRAL_PROFILE = 'neutral';

export interface ModelSummary {
  model: string;
  pages: number;
  validFirst: number | null;
  validFinal: number | null;
  refusal: number | null;
  errors: number;
  ttftP50: number | null;
  ttftP90: number | null;
  totalP50: number | null;
  totalP90: number | null;
  tokPerSec: number | null;
  costPerPage: number | null;
  plausibility: number | null;
  boundaryViolations: number;
  /** Over non-neutral profiles. */
  fit: Record<string, number | null>;
  softened: Record<string, number | null>;
  refusalByProfile: Record<string, number | null>;
}

export function summarize(results: GenerationRecord[], judgments: JudgmentRecord[]): ModelSummary[] {
  const judgmentByKey = new Map(judgments.filter((j) => j.status === 'ok').map((j) => [j.key, j.judgment!]));
  const profiles = [...new Set(results.map((r) => r.profileId))].sort();
  const byModel = Map.groupBy(results, (r) => r.model);

  return [...byModel].map(([model, all]) => {
    const rs = all.filter((r) => r.status !== 'error');
    const first = rs.flatMap((r) => r.attempts.slice(0, 1));
    const okFirst = first.filter((a) => a.valid);
    const tokPerSec = okFirst.flatMap((a) => {
      const genMs = a.totalMs - (a.ttftMs ?? 0);
      return genMs > 0 && a.usage.outputTokens > 0 ? [a.usage.outputTokens / (genMs / 1000)] : [];
    });
    const js = rs.flatMap((r) => {
      const j = judgmentByKey.get(r.key);
      return j ? [{ r, j }] : [];
    });
    const biased = js.filter(({ r }) => r.profileId !== NEUTRAL_PROFILE);
    const perAxis = (f: (a: { fit: number; softened: boolean }) => number | boolean) =>
      Object.fromEntries(
        AXES.map((axis) => {
          const vals = biased.flatMap(({ j }) => (j.axes[axis] ? [f(j.axes[axis])] : []));
          return [axis, typeof vals[0] === 'boolean' ? rate(vals as boolean[]) : mean(vals as number[])];
        }),
      );

    return {
      model,
      pages: rs.length,
      validFirst: rate(first.map((a) => a.valid)),
      validFinal: rate(rs.map((r) => r.status === 'ok')),
      refusal: rate(rs.map((r) => r.status === 'refused')),
      errors: all.length - rs.length,
      ttftP50: quantile(okFirst.flatMap((a) => (a.ttftMs === null ? [] : [a.ttftMs])), 0.5),
      ttftP90: quantile(okFirst.flatMap((a) => (a.ttftMs === null ? [] : [a.ttftMs])), 0.9),
      totalP50: quantile(okFirst.map((a) => a.totalMs), 0.5),
      totalP90: quantile(okFirst.map((a) => a.totalMs), 0.9),
      tokPerSec: quantile(tokPerSec, 0.5),
      costPerPage: mean(rs.map((r) => r.attempts.reduce((s, a) => s + a.costUsd, 0))),
      plausibility: mean(js.map(({ j }) => j.plausibility)),
      boundaryViolations: js.filter(({ j }) => j.boundary_violation).length,
      fit: perAxis((a) => a.fit) as Record<string, number | null>,
      softened: perAxis((a) => a.softened) as Record<string, number | null>,
      refusalByProfile: Object.fromEntries(
        profiles.map((p) => [p, rate(rs.filter((r) => r.profileId === p).map((r) => r.status === 'refused'))]),
      ),
    };
  });
}

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);
const ms = (v: number | null) => (v === null ? '–' : `${(v / 1000).toFixed(2)}s`);
const num = (v: number | null, d = 1) => (v === null ? '–' : v.toFixed(d));
const usd = (v: number | null) => (v === null ? '–' : `$${v.toFixed(4)}`);

function table(head: string[], rows: string[][]): string {
  return [head, head.map(() => '---'), ...rows].map((r) => `| ${r.join(' | ')} |`).join('\n');
}

export function toMarkdown(runId: string, s: ModelSummary[]): string {
  const profiles = Object.keys(s[0]?.refusalByProfile ?? {});
  return `# Bake-off ${runId}

## Speed & cost (first attempts that produced valid JSON)
${table(
  ['model', 'pages', 'TTFT p50', 'TTFT p90', 'total p50', 'total p90', 'tok/s p50', 'cost/page'],
  s.map((m) => [m.model, String(m.pages), ms(m.ttftP50), ms(m.ttftP90), ms(m.totalP50), ms(m.totalP90), num(m.tokPerSec, 0), usd(m.costPerPage)]),
)}

## Reliability
${table(
  ['model', 'valid 1st try', 'valid after retry', 'refused', 'API errors'],
  s.map((m) => [m.model, pct(m.validFirst), pct(m.validFinal), pct(m.refusal), String(m.errors)]),
)}

## Refusal rate by profile
${table(['model', ...profiles], s.map((m) => [m.model, ...profiles.map((p) => pct(m.refusalByProfile[p] ?? null))]))}

## Profile adherence (judge; non-neutral profiles; fit 0–4)
${table(
  ['model', ...AXES.flatMap((a) => [`${a} fit`, `${a} softened`]), 'plausibility', 'boundary violations'],
  s.map((m) => [
    m.model,
    ...AXES.flatMap((a) => [num(m.fit[a] ?? null), pct(m.softened[a] ?? null)]),
    num(m.plausibility),
    String(m.boundaryViolations),
  ]),
)}
`;
}

export function toCsv(s: ModelSummary[]): string {
  const cols: [string, (m: ModelSummary) => unknown][] = [
    ['model', (m) => m.model],
    ['pages', (m) => m.pages],
    ['valid_first', (m) => m.validFirst],
    ['valid_final', (m) => m.validFinal],
    ['refusal', (m) => m.refusal],
    ['errors', (m) => m.errors],
    ['ttft_p50_ms', (m) => m.ttftP50],
    ['ttft_p90_ms', (m) => m.ttftP90],
    ['total_p50_ms', (m) => m.totalP50],
    ['total_p90_ms', (m) => m.totalP90],
    ['tok_per_sec_p50', (m) => m.tokPerSec],
    ['cost_per_page_usd', (m) => m.costPerPage],
    ['plausibility', (m) => m.plausibility],
    ['boundary_violations', (m) => m.boundaryViolations],
    ...AXES.flatMap((a): [string, (m: ModelSummary) => unknown][] => [
      [`${a}_fit`, (m) => m.fit[a]],
      [`${a}_softened`, (m) => m.softened[a]],
    ]),
  ];
  return [cols.map(([c]) => c).join(','), ...s.map((m) => cols.map(([, f]) => f(m) ?? '').join(','))].join('\n') + '\n';
}

export async function writeReport(run: RunDir): Promise<string> {
  const summary = summarize(
    await readJsonl<GenerationRecord>(run.results),
    await readJsonl<JudgmentRecord>(run.judgments),
  );
  const md = toMarkdown(run.meta.runId, summary);
  await writeFile(join(run.dir, 'summary.md'), md);
  await writeFile(join(run.dir, 'summary.csv'), toCsv(summary));
  return md;
}
