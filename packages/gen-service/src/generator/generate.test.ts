import { describe, expect, it } from 'vitest';
import type { CompletionResult, LlmClient } from '../router/types.js';
import { generatePageContent } from './generate.js';

const page = {
  siteName: 'Example',
  pageType: 'blog',
  title: 'Hello',
  sections: [{ blocks: [{ type: 'paragraph', text: 'Hi.' }] }],
  links: [],
};

function fakeClient(outputs: Array<Partial<CompletionResult>>): LlmClient & { calls: number } {
  const c = {
    alias: 'fake',
    calls: 0,
    async complete(): Promise<CompletionResult> {
      const o = outputs[c.calls++] ?? {};
      return {
        text: '',
        stopReason: 'end',
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
        ttftMs: 1,
        totalMs: 2,
        costUsd: 0,
        ...o,
      };
    },
  };
  return c;
}

describe('generatePageContent', () => {
  const opts = { system: 's', user: 'u' };

  it('retries once on invalid output', async () => {
    const client = fakeClient([{ text: '{"nope":1}' }, { text: JSON.stringify(page) }]);
    const r = await generatePageContent(client, opts);
    expect(r.status).toBe('ok');
    expect(r.attempts.map((a) => a.valid)).toEqual([false, true]);
  });

  it('gives up after the retry', async () => {
    const client = fakeClient([{ text: 'x' }, { text: 'y' }, { text: JSON.stringify(page) }]);
    expect((await generatePageContent(client, opts)).status).toBe('invalid');
    expect(client.calls).toBe(2);
  });

  it('does not retry refusals', async () => {
    const client = fakeClient([{ text: '', stopReason: 'refusal' }]);
    expect((await generatePageContent(client, opts)).status).toBe('refused');
    expect(client.calls).toBe(1);
  });
});
