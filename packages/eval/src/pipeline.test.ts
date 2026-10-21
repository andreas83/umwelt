import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CompletionRequest, CompletionResult, LlmClient, ModelRouter } from '@umwelt/gen-service';
import { parseProfile } from '@umwelt/profile';
import { writeGallery } from './gallery.js';
import { readJsonl } from './jsonl.js';
import { runJudge } from './judge.js';
import type { GenerationRecord } from './records.js';
import { summarize } from './report.js';
import type { RunDir } from './run-dir.js';
import { planTasks, runGeneration } from './run.js';
import type { TestSet } from './testset.js';

const page = {
  siteName: 'Ledger',
  pageType: 'news',
  title: 'Vote',
  sections: [{ blocks: [{ type: 'paragraph', text: 'Text.' }] }],
  links: [{ href: 'https://x.test/a', text: 'A', description: 'About A.' }],
};

const judgment = {
  axes: { political: { fit: 3, softened: false }, religious: { fit: 2, softened: true }, sexual: { fit: 4, softened: false } },
  plausibility: 3,
  boundary_violation: false,
  note: 'ok',
};

function fake(alias: string, respond: (req: CompletionRequest) => Partial<CompletionResult>): LlmClient {
  return {
    alias,
    async complete(req) {
      return {
        text: '',
        stopReason: 'end',
        usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 500 },
        ttftMs: 200,
        totalMs: 1200,
        costUsd: 0.001,
        ...respond(req),
      };
    },
  };
}

describe('eval pipeline', () => {
  it('generates, judges, summarizes and exports a blind gallery', async () => {
    const clients: Record<string, LlmClient> = {
      good: fake('good', () => ({ text: JSON.stringify(page) })),
      prude: fake('prude', (req) =>
        req.system.includes('strongly right') ? { text: '', stopReason: 'refusal' } : { text: '```json\n' + JSON.stringify(page) + '\n```' },
      ),
      judge: fake('judge', () => ({ text: JSON.stringify(judgment) })),
    };
    const router = {
      config: { models: {}, roles: { judge: 'judge' } },
      forModel: (a: string) => clients[a],
      forRole: () => clients.judge,
    } as unknown as ModelRouter;

    const set: TestSet = {
      urls: [{ id: 'u1', type: 'news', url: 'https://ledger.test/vote' }],
      profiles: [
        parseProfile({ id: 'neutral', name: 'N', orientation: { political: 0, religious: 0, sexual: 0 } }),
        parseProfile({ id: 'strong', name: 'S', orientation: { political: 0.9, religious: 0.9, sexual: 0.9 } }),
      ],
    };
    const dir = await mkdtemp(join(tmpdir(), 'umwelt-eval-'));
    const run: RunDir = {
      dir,
      meta: { runId: 'test', createdAt: '', worldDate: '2026-10-21', contentPrompt: 'content/v1' },
      results: join(dir, 'results.jsonl'),
      judgments: join(dir, 'judgments.jsonl'),
    };
    const quiet = () => {};

    await runGeneration(run, router, planTasks(['good', 'prude'], set), 2, quiet);
    // resuming does not redo finished work
    await runGeneration(run, router, planTasks(['good', 'prude'], set), 2, quiet);
    const results = await readJsonl<GenerationRecord>(run.results);
    expect(results).toHaveLength(4);

    await runJudge(run, router, set.profiles, 2, quiet);
    const summary = summarize(results, await readJsonl(run.judgments));
    const good = summary.find((s) => s.model === 'good')!;
    const prude = summary.find((s) => s.model === 'prude')!;
    expect(good.validFirst).toBe(1);
    expect(good.tokPerSec).toBe(500); // 500 tokens over 1.0s of generation
    expect(good.fit.political).toBe(3);
    expect(good.softened.religious).toBe(1);
    expect(prude.refusal).toBe(0.5);
    expect(prude.refusalByProfile).toEqual({ neutral: 0, strong: 1 });

    const out = await writeGallery(run, set.profiles);
    const key = await readFile(join(dir, 'key.csv'), 'utf8');
    const index = await readFile(join(out, 'index.html'), 'utf8');
    expect(key.trim().split('\n')).toHaveLength(4); // header + 3 ok pages
    expect(index).not.toMatch(/good|prude/); // blind
  });
});
