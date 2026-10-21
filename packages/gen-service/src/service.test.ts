import { describe, expect, it } from 'vitest';
import { parseProfile } from '@umwelt/profile';
import type { CompletionRequest, CompletionResult, LlmClient } from './router/types.js';
import { PageService, resolveHref, type CompletionMetric } from './service.js';
import { pureGen } from './strategies/pure-gen.js';
import type { JsonStore, LinkStore } from './world/stores.js';
import { defaultSkeleton } from './skeleton/schema.js';

const page = (links: Array<{ href: string; description: string }>) => ({
  siteName: 'Ledger',
  pageType: 'news',
  title: 'Vote',
  sections: [{ blocks: [{ type: 'paragraph', text: 'Text.' }] }],
  links: links.map((l) => ({ ...l, text: 'link' })),
});

const skeleton = { ...defaultSkeleton('ledger.test'), siteName: 'The Ledger', nav: [{ text: 'Local', href: '/local' }] };

function fakeClient(alias: string, outputs: string[], requests: CompletionRequest[]): LlmClient {
  return {
    alias,
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
}

function memStore<T>(): JsonStore<T> {
  const m = new Map<string, T>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v) };
}

function setup(outputs: string[], skeletonOutputs: string[] = Array(5).fill(JSON.stringify(skeleton))) {
  const requests: CompletionRequest[] = [];
  const skeletonRequests: CompletionRequest[] = [];
  const linkMap = new Map<string, string>();
  const links: LinkStore = {
    get: (u) => linkMap.get(u),
    add: async (es) => es.forEach((e) => linkMap.has(e.url) || linkMap.set(e.url, e.description)),
  };
  const metrics: CompletionMetric[] = [];
  const service = new PageService({
    contentClient: fakeClient('content', outputs, requests),
    skeletonClient: fakeClient('skeleton', skeletonOutputs, skeletonRequests),
    contentPrompt: { name: 'content', version: 'test', system: 'P: {{profile}} S: {{site}}', user: 'U: {{url}} {{world_date}} {{link_context}}' },
    skeletonPrompt: { name: 'skeleton', version: 'test', system: 'P: {{profile}}', user: '{{host}} {{url}} {{world_date}}' },
    strategy: pureGen,
    pages: memStore(),
    skeletons: memStore(),
    links,
    onCompletion: (m) => metrics.push(m),
  });
  const profile = parseProfile({ id: 'p', name: 'P' });
  const req = (url: string) => ({ url: new URL(url), profile, profileId: 'p1', world: { seed: 's', date: '2026-10-21' } });
  return { service, requests, skeletonRequests, metrics, req, linkMap };
}

describe('PageService', () => {
  it('caches pages and passes link descriptions into the next prompt', async () => {
    const { service, requests, req, metrics } = setup([
      JSON.stringify(page([{ href: '/next#frag', description: 'A page about the next thing.' }])),
      JSON.stringify(page([])),
    ]);
    const first = await service.getPage(req('https://ledger.test/a'));
    expect(first.ok && first.cached).toBe(false);
    expect(first.parts.main).toContain('href="https://ledger.test/next#frag"');

    const again = await service.getPage(req('https://LEDGER.test/a#top'));
    expect(again.ok && again.cached).toBe(true);
    expect(requests).toHaveLength(1);

    await service.getPage(req('https://ledger.test/next'));
    expect(requests[1]?.user).toContain('A page about the next thing.');
    expect(metrics.filter((m) => m.kind === 'page')).toHaveLength(2);
    expect(JSON.stringify(metrics)).not.toContain('P:'); // no profile in metrics
  });

  it('generates one skeleton per domain and puts it in later prompts', async () => {
    const { service, requests, skeletonRequests, req, linkMap } = setup([JSON.stringify(page([])), JSON.stringify(page([]))]);
    const first = await service.getPage(req('https://ledger.test/a'));
    expect(first.parts.header).toContain('The Ledger');
    expect(first.parts.header).toContain('href="https://ledger.test/local"');
    expect(requests[0]?.system).toContain('Not defined yet'); // first page ran in parallel with the skeleton

    expect(await service.cachedSkeleton(req('https://ledger.test/other'))).toBeDefined();
    await service.getPage(req('https://ledger.test/b'));
    expect(skeletonRequests).toHaveLength(1);
    expect(requests[1]?.system).toContain('Site name: The Ledger');
    expect(linkMap.get('https://ledger.test/local')).toContain('"Local" section');
  });

  it('survives a throwing skeleton call', async () => {
    const { service, req } = setup([JSON.stringify(page([]))]);
    (service as unknown as { deps: { skeletonClient: LlmClient } }).deps.skeletonClient = {
      alias: 'down',
      complete: () => Promise.reject(new Error('limit reached')),
    };
    const r = await service.getPage(req('https://down.test/'));
    expect(r.ok && r.parts.header).toContain('down.test');
  });

  it('falls back to a default skeleton without caching it', async () => {
    const { service, req } = setup([JSON.stringify(page([]))], ['nope', 'nope']);
    const r = await service.getPage(req('https://plain.test/'));
    expect(r.ok && r.parts.header).toContain('plain.test');
    expect(await service.cachedSkeleton(req('https://plain.test/'))).toBeUndefined();
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
    expect(r.parts.main).toContain('could not be generated');
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
