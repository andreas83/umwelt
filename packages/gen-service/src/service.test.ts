import { describe, expect, it } from 'vitest';
import { parseProfile } from '@umwelt/profile';
import type { CompletionRequest, CompletionResult, LlmClient } from './router/types.js';
import { PageService, resolveHref, type CompletionMetric } from './service.js';
import { pureGen } from './strategies/pure-gen.js';
import type { CachedPage, LinkStore, PageStore } from './world/stores.js';

const page = (links: Array<{ href: string; description: string }>) => ({
  siteName: 'Ledger',
  pageType: 'news',
  title: 'Vote',
  sections: [{ blocks: [{ type: 'paragraph', text: 'Text.' }] }],
  links: links.map((l) => ({ ...l, text: 'link' })),
});

function setup(outputs: string[]) {
  const requests: CompletionRequest[] = [];
  const client: LlmClient = {
    alias: 'fake',
    async complete(req): Promise<CompletionResult> {
      requests.push(req);
      return {
        text: outputs.shift() ?? '',
        stopReason: 'end',
        usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 },
        ttftMs: 1,
        totalMs: 1,
        costUsd: 0,
      };
    },
  };
  const pageMap = new Map<string, CachedPage>();
  const pages: PageStore = { get: async (k) => pageMap.get(k), set: async (k, v) => void pageMap.set(k, v) };
  const linkMap = new Map<string, string>();
  const links: LinkStore = {
    get: (u) => linkMap.get(u),
    add: async (es) => es.forEach((e) => linkMap.has(e.url) || linkMap.set(e.url, e.description)),
  };
  const metrics: CompletionMetric[] = [];
  const service = new PageService({
    client,
    prompt: {
      name: 'content',
      version: 'test',
      system: 'P: {{profile}}',
      user: 'U: {{url}} {{world_date}} {{link_context}}',
    },
    strategy: pureGen,
    pages,
    links,
    onCompletion: (m) => metrics.push(m),
  });
  const profile = parseProfile({ id: 'p', name: 'P' });
  const req = (url: string) => ({ url: new URL(url), profile, profileId: 'p1', world: { seed: 's', date: '2026-10-21' } });
  return { service, requests, metrics, req, linkMap };
}

describe('PageService', () => {
  it('caches pages and passes link descriptions into the next prompt', async () => {
    const { service, requests, req, metrics } = setup([
      JSON.stringify(page([{ href: '/next#frag', description: 'A page about the next thing.' }])),
      JSON.stringify(page([])),
    ]);
    const first = await service.getPage(req('https://ledger.test/a'));
    expect(first.ok && first.cached).toBe(false);
    expect(first.parts.body).toContain('href="https://ledger.test/next#frag"');

    const again = await service.getPage(req('https://LEDGER.test/a#top'));
    expect(again.ok && again.cached).toBe(true);
    expect(requests).toHaveLength(1);

    await service.getPage(req('https://ledger.test/next'));
    expect(requests[1]?.user).toContain('A page about the next thing.');
    expect(metrics).toHaveLength(2);
    expect(JSON.stringify(metrics)).not.toContain('P:'); // no profile in metrics
  });

  it('dedupes concurrent requests for the same page', async () => {
    const { service, requests, req } = setup([JSON.stringify(page([]))]);
    await Promise.all([service.getPage(req('https://x.test/')), service.getPage(req('https://x.test/'))]);
    expect(requests).toHaveLength(1);
  });

  it('returns the error template without caching', async () => {
    const { service, requests, req } = setup(['nope', 'still nope', JSON.stringify(page([]))]);
    const r = await service.getPage(req('https://x.test/'));
    expect(r.ok).toBe(false);
    expect(r.parts.body).toContain('could not be generated');
    expect((await service.getPage(req('https://x.test/'))).ok).toBe(true);
    expect(requests).toHaveLength(3);
  });
});

describe('resolveHref', () => {
  it('only allows http(s)', () => {
    const base = new URL('https://a.test/x/y');
    expect(resolveHref('../z', base)).toBe('https://a.test/z');
    expect(resolveHref('javascript:alert(1)', base)).toBeNull();
    expect(resolveHref('mailto:a@b.c', base)).toBeNull();
  });
});
