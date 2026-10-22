import { describe, expect, it } from 'vitest';
import { parseProfile } from '@umwelt/profile';
import type { CompletionRequest, CompletionResult, LlmClient } from './router/types.js';
import { PageService, resolveHref, type CompletionMetric } from './service.js';
import { pureGen } from './strategies/pure-gen.js';
import type { JsonStore, LinkStore } from './world/stores.js';
import { defaultSkeleton } from './skeleton/schema.js';
import { ImageService } from './images/service.js';
import { PlaceholderImageProvider } from './images/placeholder.js';
import type { RawSnapshot } from './rewrite/types.js';
import type { RewriteDeps } from './service.js';

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
    images: new ImageService(new PlaceholderImageProvider()),
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

describe('linkDescriptions', () => {
  it('collects teasers and products as described links', async () => {
    const { linkDescriptions } = await import('./service.js');
    const p = {
      ...page([{ href: '/a', description: 'A.' }]),
      sections: [
        {
          blocks: [
            { type: 'teaser' as const, title: 'Story', href: '/story', summary: 'What happened.' },
            { type: 'product' as const, name: 'Mug', price: '$9', description: 'Ceramic.', href: '/mug' },
          ],
        },
      ],
    } as unknown as Parameters<typeof linkDescriptions>[0];
    expect(linkDescriptions(p).map((l) => l.href)).toEqual(['/a', '/story', '/mug']);
    expect(linkDescriptions(p)[1]?.description).toBe('Story: What happened.');
  });
});

describe('PageService mode B', () => {
  const article = (n: number) =>
    `<html><head><title>Real Site</title></head><body><nav><a href="/x">Section</a></nav><main>${Array.from(
      { length: n },
      (_, i) => `<h2><a href="/story/${i}">Original headline number ${i} here</a></h2><p>Original body text of story ${i} goes here.</p>`,
    ).join('')}<img src="/p.jpg" alt="A photo" width="400" height="400"></main></body></html>`;

  function setupB(snap: Partial<RawSnapshot> | Error, fillOutput: (ids: number[]) => string) {
    const base = setup([JSON.stringify(page([]))]);
    const raw = snap instanceof Error ? snap : ({ url: 'https://real.test/', finalUrl: 'https://real.test/', status: 200, title: 'Real Site', html: article(6), stylesheets: [], probe: null, ...snap } as RawSnapshot);
    const fillRequests: CompletionRequest[] = [];
    const rewrite: RewriteDeps = {
      snapshotter: { snapshot: async () => { if (raw instanceof Error) throw raw; return raw; } },
      fetcher: { fetch: async () => null },
      assets: { put: async () => 'a'.repeat(32), get: async () => undefined },
      templates: memStore(),
      rewrites: memStore(),
      prompt: { name: 'rewrite', version: 'test', system: 'P: {{profile}}', user: 'FILL {{url}} {{host}} {{world_date}} {{link_context}} {{outline}} {{part}} {{retry_note}}\n{{slots}}' },
    };
    const deps = (base.service as unknown as { deps: Record<string, unknown> }).deps;
    deps.rewrite = rewrite;
    const contentClient = deps.contentClient as LlmClient;
    deps.contentClient = {
      alias: 'content',
      complete: async (req: CompletionRequest) => {
        if (!req.user.startsWith('FILL ')) return contentClient.complete(req);
        fillRequests.push(req);
        const ids = [...req.user.matchAll(/^(\d+) /gm)].map((m) => Number(m[1]));
        return { text: fillOutput(ids), stopReason: 'end', usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 }, ttftMs: 1, totalMs: 1, costUsd: 0 };
      },
    } satisfies LlmClient;
    return { ...base, fillRequests };
  }

  const fillAll = (ids: number[]) => JSON.stringify({ texts: ids.map((id) => ({ id, text: `Generated ${id}` })) });

  it('rewrites the real page and caches the texts', async () => {
    const { service, req, fillRequests, linkMap } = setupB({}, fillAll);
    const r = await service.getPage(req('https://real.test/'));
    expect(r.ok && r.mode).toBe('B');
    const doc = r.ok && 'document' in r ? r.document : '';
    expect(doc).toContain('Generated 1');
    expect(doc).not.toContain('Original headline');
    expect(doc).toContain('>Section<'); // navigation keeps its wording
    expect(doc).toContain('src="https://img.umwelt.invalid/');
    expect(doc).toContain('>Generated</div>');
    expect(linkMap.get('https://real.test/story/0')).toBe('Generated 1');

    const again = await service.getPage(req('https://real.test/'));
    expect(again.ok && again.cached).toBe(true);
    expect(fillRequests).toHaveLength(1);
  });

  it('falls back to mode C with the real style when the page has too little content', async () => {
    const probe = { siteName: 'Real Name', background: 'rgb(255,255,255)', text: 'rgb(0,0,0)', link: 'rgb(180,0,0)', headerBackground: null, fontBody: 'Georgia, serif', fontHeading: null, nav: [] };
    const { service, req } = setupB({ html: article(1), probe }, fillAll);
    const r = await service.getPage(req('https://real.test/'));
    expect(r.ok && r.mode).toBe('C');
    expect(r.ok && 'parts' in r && r.parts.header).toContain('Real Name');
  });

  it('falls back to mode A when the site cannot be loaded', async () => {
    const { service, req } = setupB(new Error('net::ERR_NAME_NOT_RESOLVED'), fillAll);
    const r = await service.getPage(req('https://real.test/'));
    expect(r.ok && r.mode).toBe('A');
  });

  it('falls back to mode C when the model leaves most slots empty', async () => {
    const { service, req } = setupB({}, () => JSON.stringify({ texts: [{ id: 0, text: 'Only the title' }] }));
    const r = await service.getPage(req('https://real.test/'));
    expect(r.ok && r.mode).toBe('C');
  });
});

describe('PageService topic pin', () => {
  it('pins the story, keeps it out of the normal cache and the link store', async () => {
    const { service, requests, req, linkMap } = setup([
      JSON.stringify(page([{ href: '/a', description: 'A.' }])),
      JSON.stringify(page([{ href: '/b', description: 'B.' }])),
    ]);
    await service.getPage({ ...req('https://ledger.test/x'), topic: 'City closes centre to cars' });
    expect(requests[0]?.user).toContain('pinned to one news event');
    expect(requests[0]?.user).toContain('City closes centre to cars');
    // Same URL without the pin is a different page.
    await service.getPage(req('https://ledger.test/x'));
    expect(requests).toHaveLength(2);
    expect(linkMap.has('https://ledger.test/b')).toBe(true);
  });
});

