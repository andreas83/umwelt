import { describeProfile, type Profile } from '@umwelt/profile';
import { fillTemplate, loadPrompt, parseModelJson, type ModelRouter } from '@umwelt/gen-service';
import { z } from 'zod';
import { appendJsonl, readJsonl } from './jsonl.js';
import { promptsDir } from './paths.js';
import { mapLimit } from './pool.js';
import type { GenerationRecord, JudgmentRecord } from './records.js';
import type { RunDir } from './run-dir.js';

export const JUDGE_PROMPT = { name: 'judge', version: 'v1' } as const;

const JudgmentSchema = z.object({
  axes: z.record(z.string(), z.object({ fit: z.number().min(0).max(4), softened: z.boolean() })),
  plausibility: z.number().min(0).max(4),
  boundary_violation: z.boolean(),
  note: z.string(),
});

export async function runJudge(
  run: RunDir,
  router: ModelRouter,
  profiles: Profile[],
  concurrency: number,
  log: (line: string) => void = console.log,
): Promise<void> {
  const prompt = await loadPrompt(promptsDir, JUDGE_PROMPT.name, JUDGE_PROMPT.version);
  const judge = router.forRole('judge');
  const judged = new Set(
    (await readJsonl<JudgmentRecord>(run.judgments)).filter((j) => j.status !== 'error').map((j) => j.key),
  );
  const todo = (await readJsonl<GenerationRecord>(run.results)).filter((r) => r.status === 'ok' && !judged.has(r.key));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  let finished = 0;

  await mapLimit(todo, concurrency, async (r) => {
    const profile = byId.get(r.profileId);
    if (!profile) throw new Error(`unknown profile ${r.profileId}`);
    const base = { key: r.key, judgeModel: judge.alias, promptVersion: `${prompt.name}/${prompt.version}` };
    let record: JudgmentRecord;
    try {
      const c = await judge.complete({
        system: prompt.system,
        user: fillTemplate(prompt.user, { profile: describeProfile(profile), page: JSON.stringify(r.content) }),
        maxTokens: 16000,
      });
      const parsed = parseModelJson(c.text, JudgmentSchema);
      record = parsed.ok
        ? { ...base, status: 'ok', judgment: parsed.value, costUsd: c.costUsd, ts: new Date().toISOString() }
        : { ...base, status: 'invalid', error: parsed.error, costUsd: c.costUsd, ts: new Date().toISOString() };
    } catch (e) {
      record = { ...base, status: 'error', error: (e as Error).message, costUsd: 0, ts: new Date().toISOString() };
    }
    await appendJsonl(run.judgments, record);
    log(`[judge ${++finished}/${todo.length}] ${r.key}: ${record.status}`);
  });
}
