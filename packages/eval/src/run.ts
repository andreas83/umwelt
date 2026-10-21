import { describeProfile } from '@umwelt/profile';
import {
  fillTemplate,
  generatePageContent,
  loadPrompt,
  MissingApiKeyError,
  type GenerateAttempt,
  type LlmClient,
  type ModelRouter,
} from '@umwelt/gen-service';
import { appendJsonl, readJsonl } from './jsonl.js';
import { promptsDir } from './paths.js';
import { mapLimit } from './pool.js';
import { recordKey, type AttemptRecord, type GenerationRecord } from './records.js';
import type { RunDir } from './run-dir.js';
import type { TestSet, TestUrl } from './testset.js';
import type { Profile } from '@umwelt/profile';

/** Default for new runs; a run keeps the prompt it was created with. */
export const DEFAULT_CONTENT_PROMPT = 'content/v4';
/** The eval generates single pages without a domain skeleton. */
const SITE_UNDEFINED = 'Not defined yet. Invent the site from the URL.';

/** Rough per-page token use for the cost estimate (one attempt). */
const EST_INPUT_TOKENS = 1_500;
const EST_OUTPUT_TOKENS = 1_800;
const EST_RETRY_FACTOR = 1.1;
/** Judge reads the page and thinks before scoring. */
const EST_JUDGE_INPUT_TOKENS = 3_500;
const EST_JUDGE_OUTPUT_TOKENS = 2_500;

interface Task {
  model: string;
  url: TestUrl;
  profile: Profile;
}

export function planTasks(models: string[], set: TestSet): Task[] {
  return models.flatMap((model) => set.urls.flatMap((url) => set.profiles.map((profile) => ({ model, url, profile }))));
}

export function estimateCost(router: ModelRouter, tasks: Task[]): Map<string, { pages: number; usd: number }> {
  const est = new Map<string, { pages: number; usd: number }>();
  for (const t of tasks) {
    const p = router.config.models[t.model]?.pricing;
    if (!p) continue;
    const cur = est.get(t.model) ?? { pages: 0, usd: 0 };
    cur.pages++;
    cur.usd += ((EST_INPUT_TOKENS * p.input + EST_OUTPUT_TOKENS * p.output) / 1e6) * EST_RETRY_FACTOR;
    est.set(t.model, cur);
  }
  return est;
}

export function estimateJudgeCost(router: ModelRouter, pages: number): number {
  const alias = router.config.roles.judge;
  const p = alias ? router.config.models[alias]?.pricing : undefined;
  return p ? (pages * (EST_JUDGE_INPUT_TOKENS * p.input + EST_JUDGE_OUTPUT_TOKENS * p.output)) / 1e6 : 0;
}

function toAttemptRecord(a: GenerateAttempt): AttemptRecord {
  const c = a.completion;
  return {
    valid: a.valid,
    refused: a.refused,
    stopReason: c.stopReason,
    ttftMs: c.ttftMs,
    totalMs: c.totalMs,
    usage: c.usage,
    costUsd: c.costUsd,
    ...(a.error ? { error: a.error } : {}),
    ...(a.valid ? {} : { rawText: c.text.slice(0, 4000) }),
  };
}

export async function runGeneration(
  run: RunDir,
  router: ModelRouter,
  tasks: Task[],
  concurrency: number,
  log: (line: string) => void = console.log,
): Promise<void> {
  const [name, version] = run.meta.contentPrompt.split('/') as [string, string];
  const prompt = await loadPrompt(promptsDir, name, version);
  const done = new Set(
    (await readJsonl<GenerationRecord>(run.results)).filter((r) => r.status !== 'error').map((r) => r.key),
  );
  const todo = tasks.filter((t) => !done.has(recordKey(t.model, t.url.id, t.profile.id)));
  if (todo.length < tasks.length) log(`resuming: ${tasks.length - todo.length} already done`);

  const clients = new Map<string, LlmClient>();
  for (const model of new Set(todo.map((t) => t.model))) {
    try {
      clients.set(model, router.forModel(model));
    } catch (e) {
      if (!(e instanceof MissingApiKeyError)) throw e;
      log(`skipping ${model}: ${e.message}`);
    }
  }

  let finished = 0;
  const runnable = todo.filter((t) => clients.has(t.model));
  const byModel = Map.groupBy(runnable, (t) => t.model);

  await Promise.all(
    [...byModel].map(([model, modelTasks]) =>
      mapLimit(modelTasks, concurrency, async (t) => {
        const client = clients.get(model) as LlmClient;
        const base = {
          key: recordKey(t.model, t.url.id, t.profile.id),
          model: t.model,
          urlId: t.url.id,
          url: t.url.url,
          pageType: t.url.type,
          profileId: t.profile.id,
          promptVersion: `${prompt.name}/${prompt.version}`,
        };
        let record: GenerationRecord;
        try {
          const outcome = await generatePageContent(client, {
            system: fillTemplate(prompt.system, { profile: describeProfile(t.profile), site: SITE_UNDEFINED }),
            user: fillTemplate(prompt.user, { url: t.url.url, world_date: run.meta.worldDate, link_context: '' }),
          });
          record = {
            ...base,
            status: outcome.status,
            attempts: outcome.attempts.map(toAttemptRecord),
            ...(outcome.status === 'ok' ? { content: outcome.content } : {}),
            ts: new Date().toISOString(),
          };
        } catch (e) {
          record = { ...base, status: 'error', error: (e as Error).message, attempts: [], ts: new Date().toISOString() };
        }
        await appendJsonl(run.results, record);
        const secs = record.attempts.reduce((s, a) => s + a.totalMs, 0) / 1000;
        const usd = record.attempts.reduce((s, a) => s + a.costUsd, 0);
        log(
          `[${++finished}/${runnable.length}] ${model} ${t.url.id} × ${t.profile.id}: ${record.status}` +
            (record.error ? ` (${record.error})` : ` ${secs.toFixed(1)}s $${usd.toFixed(4)}`),
        );
      }),
    ),
  );
}
