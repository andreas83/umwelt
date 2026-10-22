import { createHash } from 'node:crypto';
import type { Profile } from '@umwelt/profile';
import { describeProfile } from '@umwelt/profile';
import { generatePageContent, generateValidated, type GenerateAttempt } from './generator/generate.js';
import type { PageContent } from './generator/schema.js';
import type { ImageService } from './images/service.js';
import { fillTemplate, type PromptTemplate } from './prompts.js';
import { renderErrorParts, renderPageParts, renderChrome, type PageParts } from './renderer/render.js';
import type { LlmClient } from './router/types.js';
import { defaultSkeleton, describeSkeleton, SiteSkeletonSchema, type SiteSkeleton } from './skeleton/schema.js';
import type { SourceStrategy } from './strategies/types.js';
import { normalizeUrl, pageCacheKey, skeletonCacheKey } from './world/cache-key.js';
import type { JsonStore, LinkStore, PageStore, SkeletonStore } from './world/stores.js';
import type { AssetStore } from './rewrite/assets.js';
import { assemble, fillSlots } from './rewrite/fill.js';
import { applyProbe } from './rewrite/probe.js';
import { prepareTemplate } from './rewrite/sanitize.js';
import type { PageSnapshotter, PageTemplate, ResourceFetcher, StyleProbe } from './rewrite/types.js';
import type { Mode } from './strategies/types.js';
import type { ImageAspect } from './generator/schema.js';
import type { WorldState } from './world/types.js';

/** One LLM call, for `world/metrics`. Never contains the profile (invariant 3). */
export interface CompletionMetric {
  ts: string;
  kind: 'page' | 'skeleton' | 'rewrite';
  url: string;
  model: string;
  promptVersion: string;
  stopReason: string;
  valid: boolean;
  ttftMs: number | null;
  totalMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface PageServiceDeps {
  /** The `content` role. */
  contentClient: LlmClient;
  /** The `skeleton` role. */
  skeletonClient: LlmClient;
  /** System part: `{{profile}}`, `{{site}}`. User part: `{{url}}`, `{{world_date}}`, `{{link_context}}`. */
  contentPrompt: PromptTemplate;
  /** System part: `{{profile}}`. User part: `{{host}}`, `{{url}}`, `{{world_date}}`. */
  skeletonPrompt: PromptTemplate;
  strategy: SourceStrategy;
  pages: PageStore;
  skeletons: SkeletonStore;
  links: LinkStore;
  images: ImageService;
  /** Present → mode B (rewrite real pages), falling back to C (real style) and then A. Absent → mode A. */
  rewrite?: RewriteDeps;
  onCompletion?: (m: CompletionMetric) => void;
}

export interface CachedRewrite {
  url: string;
  texts: Record<number, string>;
  model: string;
  promptVersion: string;
  createdAt: string;
}

export interface RewriteDeps {
  snapshotter: PageSnapshotter;
  fetcher: ResourceFetcher;
  assets: AssetStore;
  /** Sanitized real pages, keyed by URL; independent of the profile. */
  templates: JsonStore<PageTemplate>;
  /** Generated texts per (url, profile, world, mode). */
  rewrites: JsonStore<CachedRewrite>;
  /** System part: `{{profile}}`. User part: `{{url}}`, `{{host}}`, `{{world_date}}`, `{{link_context}}`, `{{outline}}`, `{{part}}`, `{{slots}}`. */
  prompt: PromptTemplate;
}

/** A real page with fewer content slots than this is a login wall, an empty app shell or a bot block → mode C. */
export const MIN_CONTENT_SLOTS = 8;
/** If the model leaves more than this share of slots empty, the page falls back to mode C. */
const MAX_MISSING_SHARE = 0.4;
/** Failed snapshots are not retried for this long. */
const SNAPSHOT_RETRY_MS = 30 * 60_000;

type TemplateResult = { template: PageTemplate } | { template: null; probe: StyleProbe | null; reason: string };

export interface PageRequest {
  url: URL;
  profile: Profile;
  /** Changes whenever the profile changes, so edited profiles get fresh pages. */
  profileId: string;
  world: WorldState;
  /**
   * Pins the page to one story, whatever the real page or URL is about: for comparing the same story across sites
   * and profiles. Part of the cache key; the real article's slug is hidden from the model.
   */
  topic?: string;
}

/** Profile id as used in page cache keys: a pinned topic is a different page. */
function variantId(req: PageRequest): string {
  return req.topic ? `${req.profileId}|topic:${createHash('sha256').update(req.topic).digest('hex').slice(0, 16)}` : req.profileId;
}

/** What the model is told about why this page is shown. */
function linkContext(req: PageRequest, description: string | undefined): string {
  if (req.topic) {
    return (
      `This page is pinned to one news event: ${req.topic} ` +
      "Write the page entirely about this event, as this site reports it for its audience in this bubble: the headline, " +
      "lead, quotes and choice of voices take the side this audience takes. Do not copy the event description as the headline."
    );
  }
  return description ? `The reader arrived by following a link described as: ${description}` : '';
}

export type PageResult =
  /** Modes A and C: rendered from our templates. */
  | { ok: true; mode: Mode; cached: boolean; parts: PageParts }
  /** Mode B: a whole rewritten document. */
  | { ok: true; mode: 'B'; cached: boolean; document: string }
  | { ok: false; mode: Mode; parts: PageParts };

/** Before a domain's skeleton exists, the content prompt says so. */
const SITE_UNDEFINED = 'Not defined yet. Invent the site from the URL.';

/** Absolute http(s) URL for a generated href, or null for anything else (javascript:, mailto:, garbage). */
export function resolveHref(href: string, base: URL): string | null {
  try {
    const u = new URL(href, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const version = (p: PromptTemplate) => `${p.name}/${p.version}`;

/** Every outgoing href on a page with what the page says it leads to: links, teasers, products. */
export function linkDescriptions(page: PageContent): Array<{ href: string; description: string }> {
  const out = page.links.map((l) => ({ href: l.href, description: l.description }));
  for (const b of page.sections.flatMap((s) => s.blocks)) {
    if (b.type === 'teaser') out.push({ href: b.href, description: b.summary ? `${b.title}: ${b.summary}` : b.title });
    if (b.type === 'product' && b.href) out.push({ href: b.href, description: `Product page for ${b.name} (${b.price}): ${b.description}` });
  }
  return out;
}

function aspectOf(w: number | null, h: number | null): ImageAspect {
  if (!w || !h) return 'wide';
  const r = w / h;
  return r > 1.2 ? 'wide' : r < 0.85 ? 'portrait' : 'square';
}

export class PageService {
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly failedSnapshots = new Map<string, { at: number; result: TemplateResult }>();

  constructor(private readonly deps: PageServiceDeps) {}

  /** Same key → same promise, so concurrent requests share one generation. */
  private once<T>(key: string, fn: () => Promise<T>): Promise<T> {
    let p = this.inflight.get(key) as Promise<T> | undefined;
    if (!p) {
      p = fn().finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    return p;
  }

  /** Mode A streams a cached skeleton's header before content; mode B can't, since it doesn't know the page yet. */
  get streamsChromeEarly(): boolean {
    return !this.deps.rewrite;
  }

  getPage(req: PageRequest): Promise<PageResult> {
    if (this.deps.rewrite) return this.once(pageCacheKey(req.url, variantId(req), req.world.seed, 'B'), () => this.loadRewrite(req));
    return this.once(pageCacheKey(req.url, variantId(req), req.world.seed, this.deps.strategy.id), () => this.load(req, null, 'A'));
  }

  /** The domain's skeleton if it is already cached — lets the caller stream header and theme before content. */
  async cachedSkeleton(req: PageRequest): Promise<SiteSkeleton | undefined> {
    return (await this.deps.skeletons.get(skeletonCacheKey(req.url, req.profileId, req.world.seed)))?.skeleton;
  }

  /** Header, nav, footer and theme for a skeleton, with links resolved against the request URL. */
  chrome(skeleton: SiteSkeleton, url: URL): ReturnType<typeof renderChrome> {
    return renderChrome(skeleton, { linkHref: (h) => resolveHref(h, url) ?? '#' });
  }

  private render(req: PageRequest, content: PageContent, skeleton: SiteSkeleton): PageParts {
    const ctx = { profileId: req.profileId, worldSeed: req.world.seed };
    return renderPageParts(content, skeleton, {
      linkHref: (h) => resolveHref(h, req.url) ?? '#',
      imageSrc: (img) => this.deps.images.url(img, ctx),
    });
  }

  /** Mode B: rewrite the real page. Falls back to mode C with the real site's style, or to A without it. */
  private async loadRewrite(req: PageRequest): Promise<PageResult> {
    const rw = this.deps.rewrite!;
    const t = await this.template(req.url);
    if (!t.template) return this.load(req, t.probe, t.probe ? 'C' : 'A');

    const key = pageCacheKey(req.url, variantId(req), req.world.seed, 'B');
    const imageSrc = (slot: PageTemplate['images'][number]) =>
      this.deps.images.url(
        { id: String(slot.id), prompt: slot.alt || `photo on ${t.template.host}`, alt: slot.alt, aspect: aspectOf(slot.width, slot.height) },
        { profileId: req.profileId, worldSeed: req.world.seed },
      );
    const cached = await rw.rewrites.get(key);
    if (cached) return { ok: true, mode: 'B', cached: true, document: assemble(t.template, cached.texts, imageSrc) };

    const url = normalizeUrl(req.url);
    const description = this.deps.links.get(url);
    const fill = await fillSlots(this.deps.contentClient, rw.prompt, {
      template: t.template,
      profile: req.profile,
      worldDate: req.world.date,
      linkContext: linkContext(req, description),
      ...(req.topic ? { hideUrlPath: true } : {}),
    });
    this.metrics('rewrite', url, this.deps.contentClient, rw.prompt, fill.attempts);
    if (fill.missing > t.template.slots.length * MAX_MISSING_SHARE) return this.load(req, null, 'C');

    await rw.rewrites.set(key, {
      url,
      texts: fill.texts,
      model: this.deps.contentClient.alias,
      promptVersion: version(rw.prompt),
      createdAt: new Date().toISOString(),
    });
    // The generated headline of a link becomes the description of the page it leads to. Pinned pages don't teach
    // the link store: their stories belong to the pin, not to the site.
    if (!req.topic) await this.deps.links.add(
      t.template.slots.flatMap((s) => {
        const text = fill.texts[s.id];
        const target = s.href && text && (s.kind === 'headline' || s.kind === 'link') ? resolveHref(s.href, req.url) : null;
        return target ? [{ url: normalizeUrl(target), description: text! }] : [];
      }),
    );
    return { ok: true, mode: 'B', cached: false, document: assemble(t.template, fill.texts, imageSrc) };
  }

  /** The sanitized real page for a URL: cached, or snapshotted now. Failures are remembered for a while. */
  private template(u: URL): Promise<TemplateResult> {
    const url = normalizeUrl(u);
    return this.once(`template:${url}`, async () => {
      const rw = this.deps.rewrite!;
      const key = pageCacheKey(new URL(url), '', '', 'B');
      const stored = await rw.templates.get(key);
      if (stored) return { template: stored };
      const failed = this.failedSnapshots.get(url);
      if (failed && Date.now() - failed.at < SNAPSHOT_RETRY_MS) return failed.result;

      let result: TemplateResult;
      try {
        const raw = await rw.snapshotter.snapshot(url);
        if (raw.status >= 400) {
          result = { template: null, probe: raw.probe, reason: `HTTP ${raw.status}` };
        } else {
          const template = await prepareTemplate(raw, { fetcher: rw.fetcher, assets: rw.assets });
          const content = template.slots.filter((s) => s.kind !== 'title').length;
          if (content < MIN_CONTENT_SLOTS || template.loginWall) {
            result = { template: null, probe: raw.probe, reason: template.loginWall ? 'login wall' : `only ${content} content slots` };
          } else {
            await rw.templates.set(key, template);
            return { template };
          }
        }
      } catch (e) {
        result = { template: null, probe: null, reason: (e as Error).message };
      }
      console.warn(`mode B unavailable for ${url}: ${result.reason}`);
      this.failedSnapshots.set(url, { at: Date.now(), result });
      return result;
    });
  }

  private async load(req: PageRequest, probe: StyleProbe | null, mode: Mode): Promise<PageResult> {
    const { contentClient, contentPrompt, strategy, pages, links } = this.deps;
    const url = normalizeUrl(req.url);
    const known = await this.cachedSkeleton(req);
    // First visit to a domain: skeleton and content are generated in parallel.
    const skeletonP = (known ? Promise.resolve(known) : this.skeleton(req)).then((s) => (probe ? applyProbe(s, probe) : s));

    const cached = await pages.get(pageCacheKey(req.url, variantId(req), req.world.seed, mode));
    if (cached) return { ok: true, mode, cached: true, parts: this.render(req, cached.content, await skeletonP) };

    await strategy.resolve(req.url, req.profile, req.world);
    const description = links.get(url);
    const outcome = await generatePageContent(contentClient, {
      system: fillTemplate(contentPrompt.system, {
        profile: describeProfile(req.profile),
        site: known ? describeSkeleton(probe ? applyProbe(known, probe) : known) : SITE_UNDEFINED,
      }),
      user: fillTemplate(contentPrompt.user, {
        url,
        world_date: req.world.date,
        link_context: linkContext(req, description),
      }),
      maxTokens: 12000,
    });
    this.metrics('page', url, contentClient, contentPrompt, outcome.attempts);
    const skeleton = await skeletonP;

    if (outcome.status !== 'ok') {
      const reason = outcome.status === 'refused' ? 'The model declined to write this page.' : 'The model did not return a valid page.';
      return { ok: false, mode, parts: renderErrorParts(url, reason) };
    }

    await pages.set(pageCacheKey(req.url, variantId(req), req.world.seed, mode), {
      url,
      content: outcome.content,
      model: contentClient.alias,
      promptVersion: version(contentPrompt),
      createdAt: new Date().toISOString(),
    });
    await links.add(
      linkDescriptions(outcome.content).flatMap(({ href, description }) => {
        const target = resolveHref(href, req.url);
        return target ? [{ url: normalizeUrl(target), description }] : [];
      }),
    );
    return { ok: true, mode, cached: false, parts: this.render(req, outcome.content, skeleton) };
  }

  /** Generates and caches the domain's skeleton. Falls back to a plain default (not cached) on failure. */
  private skeleton(req: PageRequest): Promise<SiteSkeleton> {
    const key = skeletonCacheKey(req.url, req.profileId, req.world.seed);
    return this.once(key, async () => {
      const { skeletonClient, skeletonPrompt, skeletons, links } = this.deps;
      const url = normalizeUrl(req.url);
      let outcome;
      try {
        outcome = await generateValidated(skeletonClient, SiteSkeletonSchema, {
          system: fillTemplate(skeletonPrompt.system, { profile: describeProfile(req.profile) }),
          user: fillTemplate(skeletonPrompt.user, { host: req.url.hostname, url, world_date: req.world.date }),
          maxTokens: 2000,
        });
      } catch (e) {
        // A missing skeleton never fails the page; it may run unawaited while content fails first.
        console.error(`skeleton generation failed for ${req.url.hostname}:`, (e as Error).message);
        return defaultSkeleton(req.url.hostname);
      }
      this.metrics('skeleton', url, skeletonClient, skeletonPrompt, outcome.attempts);
      if (outcome.status !== 'ok') return defaultSkeleton(req.url.hostname);

      const s = outcome.content;
      await skeletons.set(key, {
        host: req.url.hostname,
        skeleton: s,
        model: skeletonClient.alias,
        promptVersion: version(skeletonPrompt),
        createdAt: new Date().toISOString(),
      });
      await links.add(
        s.nav.flatMap((l) => {
          const target = resolveHref(l.href, req.url);
          return target ? [{ url: normalizeUrl(target), description: `The "${l.text}" section front page of ${s.siteName}.` }] : [];
        }),
      );
      return s;
    });
  }

  private metrics(kind: CompletionMetric['kind'], url: string, client: LlmClient, prompt: PromptTemplate, attempts: GenerateAttempt[]): void {
    for (const a of attempts) {
      const c = a.completion;
      this.deps.onCompletion?.({
        ts: new Date().toISOString(),
        kind,
        url,
        model: client.alias,
        promptVersion: version(prompt),
        stopReason: c.stopReason,
        valid: a.valid,
        ttftMs: c.ttftMs,
        totalMs: c.totalMs,
        ...c.usage,
        costUsd: c.costUsd,
      });
    }
  }
}
