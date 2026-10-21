import type { Profile } from '@umwelt/profile';
import { describeProfile } from '@umwelt/profile';
import { generatePageContent, generateValidated, type GenerateAttempt } from './generator/generate.js';
import type { PageContent } from './generator/schema.js';
import { fillTemplate, type PromptTemplate } from './prompts.js';
import { renderErrorParts, renderPageParts, renderChrome, type PageParts } from './renderer/render.js';
import type { LlmClient } from './router/types.js';
import { defaultSkeleton, describeSkeleton, SiteSkeletonSchema, type SiteSkeleton } from './skeleton/schema.js';
import type { SourceStrategy } from './strategies/types.js';
import { normalizeUrl, pageCacheKey, skeletonCacheKey } from './world/cache-key.js';
import type { LinkStore, PageStore, SkeletonStore } from './world/stores.js';
import type { WorldState } from './world/types.js';

/** One LLM call, for `world/metrics`. Never contains the profile (invariant 3). */
export interface CompletionMetric {
  ts: string;
  kind: 'page' | 'skeleton';
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
  onCompletion?: (m: CompletionMetric) => void;
}

export interface PageRequest {
  url: URL;
  profile: Profile;
  /** Changes whenever the profile changes, so edited profiles get fresh pages. */
  profileId: string;
  world: WorldState;
}

export type PageResult = { ok: true; cached: boolean; parts: PageParts } | { ok: false; parts: PageParts };

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

export class PageService {
  private readonly inflight = new Map<string, Promise<unknown>>();

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

  getPage(req: PageRequest): Promise<PageResult> {
    return this.once(pageCacheKey(req.url, req.profileId, req.world.seed, this.deps.strategy.id), () => this.load(req));
  }

  /** The domain's skeleton if it is already cached — lets the caller stream header and theme before content. */
  async cachedSkeleton(req: PageRequest): Promise<SiteSkeleton | undefined> {
    return (await this.deps.skeletons.get(skeletonCacheKey(req.url, req.profileId, req.world.seed)))?.skeleton;
  }

  /** Header, nav, footer and theme for a skeleton, with links resolved against the request URL. */
  chrome(skeleton: SiteSkeleton, url: URL): ReturnType<typeof renderChrome> {
    return renderChrome(skeleton, { linkHref: (h) => resolveHref(h, url) ?? '#' });
  }

  private render(url: URL, content: PageContent, skeleton: SiteSkeleton): PageParts {
    return renderPageParts(content, skeleton, { linkHref: (h) => resolveHref(h, url) ?? '#' });
  }

  private async load(req: PageRequest): Promise<PageResult> {
    const { contentClient, contentPrompt, strategy, pages, links } = this.deps;
    const url = normalizeUrl(req.url);
    const known = await this.cachedSkeleton(req);
    // First visit to a domain: skeleton and content are generated in parallel.
    const skeletonP = known ? Promise.resolve(known) : this.skeleton(req);

    const cached = await pages.get(pageCacheKey(req.url, req.profileId, req.world.seed, strategy.id));
    if (cached) return { ok: true, cached: true, parts: this.render(req.url, cached.content, await skeletonP) };

    await strategy.resolve(req.url, req.profile, req.world);
    const description = links.get(url);
    const outcome = await generatePageContent(contentClient, {
      system: fillTemplate(contentPrompt.system, {
        profile: describeProfile(req.profile),
        site: known ? describeSkeleton(known) : SITE_UNDEFINED,
      }),
      user: fillTemplate(contentPrompt.user, {
        url,
        world_date: req.world.date,
        link_context: description ? `The reader arrived by following a link described as: ${description}` : '',
      }),
    });
    this.metrics('page', url, contentClient, contentPrompt, outcome.attempts);
    const skeleton = await skeletonP;

    if (outcome.status !== 'ok') {
      const reason = outcome.status === 'refused' ? 'The model declined to write this page.' : 'The model did not return a valid page.';
      return { ok: false, parts: renderErrorParts(url, reason) };
    }

    await pages.set(pageCacheKey(req.url, req.profileId, req.world.seed, strategy.id), {
      url,
      content: outcome.content,
      model: contentClient.alias,
      promptVersion: version(contentPrompt),
      createdAt: new Date().toISOString(),
    });
    await links.add(
      outcome.content.links.flatMap((l) => {
        const target = resolveHref(l.href, req.url);
        return target ? [{ url: normalizeUrl(target), description: l.description }] : [];
      }),
    );
    return { ok: true, cached: false, parts: this.render(req.url, outcome.content, skeleton) };
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
