import { describe, expect, it } from 'vitest';
import { defaultSkeleton } from '../skeleton/schema.js';
import type { AssetStore } from './assets.js';
import { localizeCss } from './assets.js';
import { assemble, copiesOriginal, fillSlots } from './fill.js';
import type { CompletionRequest, LlmClient } from '../router/types.js';
import { parseProfile } from '@umwelt/profile';
import { applyProbe, cssColorToHex } from './probe.js';
import { prepareTemplate } from './sanitize.js';
import type { FetchedResource, RawSnapshot, ResourceFetcher } from './types.js';

const fetched = new Map<string, FetchedResource>([
  ['https://news.test/font.woff2', { contentType: 'font/woff2', bytes: new Uint8Array([1, 2, 3]) }],
  ['https://news.test/logo.svg', { contentType: 'image/svg+xml', bytes: new TextEncoder().encode('<svg/>') }],
  ['https://cdn.test/site.css', { contentType: 'text/css', bytes: new TextEncoder().encode('.x{background:url(/bg.png)}') }],
]);
const fetcher: ResourceFetcher = { fetch: async (u) => fetched.get(u) ?? null };
const memAssets = (): AssetStore => {
  const m = new Map<string, FetchedResource>();
  return { put: async (r) => (m.set(String(m.size).padStart(32, '0'), r), String(m.size - 1).padStart(32, '0')), get: async (id) => m.get(id) };
};

const html = `<html><head><title>Daily News – Front</title><script>alert(1)</script><link rel="stylesheet" href="/a.css"></head>
<body onload="x()">
  <header><a class="logo" href="/"><img src="/logo.svg" alt="Daily News"></a><nav><a href="/politics">Politics</a></nav></header>
  <div id="cookie-banner">We use cookies, accept them all please</div>
  <main>
    <article>
      <h2><a href="/story/1">Mayor announces sweeping new housing plan</a></h2>
      <p class="byline">By Jane Realperson</p>
      <p>The council will vote on the proposal next week, officials said on Monday.</p>
      <img src="/photo.jpg" alt="Mayor at podium" width="800" height="450">
      <time>2 hours ago</time>
      <a href="javascript:steal()">Click here now please</a>
      <form><input type="password" value="hunter2"></form>
      <p>Contains ⟦3⟧ marker-like text in the original.</p>
    </article>
  </main>
  <footer>© 2026 Daily News Corp. All rights reserved.</footer>
  <iframe src="https://ads.test"></iframe>
</body></html>`;

const raw: RawSnapshot = {
  url: 'https://news.test/',
  finalUrl: 'https://news.test/',
  status: 200,
  title: 'Daily News – Front',
  html,
  stylesheets: [
    { href: null, text: '@font-face{font-family:X;src:url(/font.woff2)} body{background:url(https://tracker.test/p.gif)}', media: '' },
    { href: 'https://cdn.test/site.css', text: null, media: 'screen' },
  ],
  probe: null,
};

describe('prepareTemplate', () => {
  it('removes active content and marks content text and images', async () => {
    const t = await prepareTemplate(raw, { fetcher, assets: memAssets() });
    expect(t.html).not.toMatch(/<script|<iframe|onload=|javascript:|hunter2|cookie-banner|<link/);
    expect(t.html).toMatch(/<input (?=[^>]*disabled)(?=[^>]*type="password")/);
    const kinds = Object.fromEntries(t.slots.map((s) => [s.original, s.kind]));
    expect(kinds['Mayor announces sweeping new housing plan']).toBe('headline');
    expect(kinds['By Jane Realperson']).toBe('byline');
    expect(kinds['The council will vote on the proposal next week, officials said on Monday.']).toBe('text');
    expect(kinds['Daily News – Front']).toBe('title');
    // Furniture keeps its wording.
    expect(t.html).toContain('>Politics<');
    expect(t.html).toContain('2 hours ago');
    expect(t.html).toContain('© 2026 Daily News Corp.');
    // Logo copied locally, photo replaced by an image slot.
    expect(t.html).toContain('src="https://asset.umwelt.invalid/');
    expect(t.images).toEqual([{ id: 0, alt: 'Mayor at podium', width: 800, height: 450 }]);
    // Real wording in attributes is gone; the photo's alt survives only as the image prompt.
    expect(t.html).not.toMatch(/alt="Mayor at podium"|alt="Daily News"/);
    // Original marker characters cannot collide with real markers.
    expect(t.slots.find((s) => s.original.startsWith('Contains'))?.original).not.toContain('⟦');
  });

  it('localizes CSS: fonts copied, trackers dropped, media kept', async () => {
    const t = await prepareTemplate(raw, { fetcher, assets: memAssets() });
    expect(t.html).toContain('src:url("https://asset.umwelt.invalid/');
    expect(t.html).not.toContain('tracker.test');
    expect(t.html).toContain('@media screen{.x{background:none}}');
  });
});

describe('assemble', () => {
  it('fills markers with escaped text, blanks missing slots, adds the indicator', async () => {
    const t = await prepareTemplate(raw, { fetcher, assets: memAssets() });
    const headline = t.slots.find((s) => s.kind === 'headline')!.id;
    const out = assemble(t, { [headline]: 'New <b>plan</b>' }, () => 'https://img.umwelt.invalid/abc');
    expect(out).toContain('New &lt;b&gt;plan&lt;/b&gt;');
    expect(out).not.toContain('Mayor announces');
    expect(out).not.toContain('Jane Realperson');
    expect(out).not.toMatch(/⟦/);
    expect(out).toContain('src="https://img.umwelt.invalid/abc"');
    expect(out).toContain('>Generated</div></body>');
  });
});

describe('mode C probe', () => {
  it('converts computed colors and overrides the skeleton', () => {
    expect(cssColorToHex('rgb(255, 0, 16)')).toBe('#ff0010');
    expect(cssColorToHex('rgba(0, 0, 0, 0)')).toBeNull();
    const s = applyProbe(defaultSkeleton('x.test'), {
      siteName: 'Real Name', background: 'rgb(250, 250, 250)', text: 'rgb(20, 20, 20)', link: 'rgb(200, 0, 0)',
      headerBackground: 'rgb(0, 0, 0)', fontBody: '"Tiempos", Georgia, serif', fontHeading: null,
      nav: [{ text: 'A', href: '/a' }, { text: 'B', href: '/b' }, { text: 'C', href: '/c' }],
    });
    expect(s.siteName).toBe('Real Name');
    expect(s.palette.accent).toBe('#c80000');
    expect(s.fonts).toEqual({ body: 'serif', heading: 'serif' });
    expect(s.nav).toHaveLength(3);
  });
});

describe('localizeCss', () => {
  it('never leaves a remote url()', async () => {
    const css = await localizeCss('a{b:url(//evil.test/x.png)} c{d:url("data:text/html,<script>")}', 'https://news.test/', fetcher, memAssets());
    expect(css).not.toContain('evil.test');
    expect(css).not.toContain('text/html');
  });
});

describe('copiesOriginal', () => {
  const slot = (kind: 'headline' | 'link' | 'title', original: string) => ({ id: 1, kind, tag: 'h2', href: null, words: original.split(' ').length, original });

  it('rejects verbatim and near-verbatim copies of content', () => {
    expect(copiesOriginal(slot('headline', 'Offene Fragen nach dem AfD-Leak'), 'Offene Fragen nach dem AfD-Leak')).toBe(true);
    expect(copiesOriginal(slot('headline', 'Meta Platforms erhöht Ausgaben deutlich'), 'Meta Platforms erhöht die Ausgaben deutlich!')).toBe(true);
    expect(copiesOriginal(slot('headline', 'Meta Platforms erhöht Ausgaben deutlich'), 'Genossenschaft eröffnet zweites Reparaturcafé')).toBe(false);
  });

  it('lets labels, short interface links and the title keep their wording', () => {
    expect(copiesOriginal(slot('headline', 'Security'), 'Security')).toBe(false);
    expect(copiesOriginal(slot('link', 'Mehr lesen'), 'Mehr lesen')).toBe(false);
    expect(copiesOriginal(slot('title', 'heise online'), 'heise online')).toBe(false);
  });
});

describe('fillSlots', () => {
  it('retries copied slots once and blanks what is still copied', async () => {
    const t = await prepareTemplate(raw, { fetcher, assets: memAssets() });
    const headline = t.slots.find((s) => s.kind === 'headline')!;
    const body = t.slots.find((s) => s.kind === 'text')!;
    const calls: CompletionRequest[] = [];
    const client: LlmClient = {
      alias: 'fake',
      async complete(req) {
        calls.push(req);
        const ids = [...req.user.matchAll(/^(\d+) /gm)].map((m) => Number(m[1]));
        const retry = req.user.includes('were rejected');
        const texts = ids.map((id) => ({
          id,
          // First pass copies the headline; the retry fixes it but copies the body again.
          text: id === headline.id ? (retry ? 'Cooperative opens a repair café' : headline.original) : id === body.id ? body.original : `New ${id}`,
        }));
        return { text: JSON.stringify({ texts }), stopReason: 'end', usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 }, ttftMs: 1, totalMs: 1, costUsd: 0 };
      },
    };
    const prompt = { name: 'rewrite', version: 't', system: '{{profile}}', user: '{{retry_note}}\n{{slots}}' };
    const r = await fillSlots(client, prompt, { template: t, profile: parseProfile({ id: 'p', name: 'P' }), worldDate: '2026-10-22', linkContext: '' });
    expect(calls).toHaveLength(2);
    expect(r.texts[headline.id]).toBe('Cooperative opens a repair café');
    expect(r.texts[body.id]).toBeUndefined();
    expect(r.missing).toBe(1);
  });
});


describe('slotLine', () => {
  it('shows labels but hides real headlines and article slugs', async () => {
    const { slotLine } = await import('./fill.js');
    const label = { id: 3, kind: 'headline' as const, tag: 'h2', href: null, words: 1, original: 'Security' };
    const story = { id: 4, kind: 'headline' as const, tag: 'h3', href: 'https://x.test/security/Offene-Fragen-nach-dem-Leak-1234.html', words: 5, original: 'Offene Fragen nach dem Leak' };
    expect(slotLine(label, null)).toBe('3 headline/h2 (1w): Security');
    const line = slotLine(story, 'Security');
    expect(line).toBe('4 headline/h3 →/security/… (5w) [under: Security]');
    expect(line).not.toContain('Offene');
  });
});

describe('paragraphs with inline links', () => {
  const wiki: RawSnapshot = {
    ...raw,
    html: '<html><head><title>Fahrradstraße – Wiki</title></head><body><main><p>Eine <b>Fahrradstraße</b> ist eine Straße, auf der der <a href="/wiki/Radverkehr" class="mw">Radverkehr</a> Vorrang hat und <a href="/wiki/Auto">Kraftfahrzeuge</a> nur geduldet sind.</p><p><b>Bold</b> only, no links in this paragraph at all here.</p></main><form><input type="password"></form></body></html>',
    stylesheets: [],
  };

  it('becomes one slot whose links survive assembly', async () => {
    const t = await prepareTemplate(wiki, { fetcher, assets: memAssets() });
    const p = t.slots.find((s) => s.links?.length)!;
    expect(p.original).toBe('Eine Fahrradstraße ist eine Straße, auf der der [[1:Radverkehr]] Vorrang hat und [[2:Kraftfahrzeuge]] nur geduldet sind.');
    const out = assemble(t, { [p.id]: 'Hier hat der [[1:Fahrradverkehr]] immer Vorrang, [[7:Unbekannt]] & <Autos> [[2:warten]].' }, () => '');
    expect(out).toContain('Hier hat der <a href="https://news.test/wiki/Radverkehr" class="mw">Fahrradverkehr</a> immer Vorrang, Unbekannt &amp; &lt;Autos&gt; <a href="https://news.test/wiki/Auto">warten</a>.');
    expect(out).not.toContain('Fahrradstraße ist eine Straße');
  });

  it('flags a login form with little content as a login wall', async () => {
    expect((await prepareTemplate(wiki, { fetcher, assets: memAssets() })).loginWall).toBe(true);
    expect((await prepareTemplate(raw, { fetcher, assets: memAssets() })).loginWall).toBe(true);
  });
});
