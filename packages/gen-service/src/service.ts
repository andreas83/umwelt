import type { Profile } from '@umwelt/profile';
import { describeProfile } from '@umwelt/profile';
import { generatePageContent } from './generator/generate.js';
import { fillTemplate, type PromptTemplate } from './prompts.js';
import { renderErrorParts, renderPageParts, type PageParts } from './renderer/render.js';
import type { CompletionResult, LlmClient } from './router/types.js';
import type { SourceStrategy } from './strategies/types.js';
import { normalizeUrl, pageCacheKey } from './world/cache-key.js';
import type { LinkStore, PageStore } from './world/stores.js';
import type { WorldState } from './world/types.js';

/** One LLM call, for `world/metrics`. Never contains the profile (invariant 3). */
export interface CompletionMetric {
  ts: string;
  kind: 'page';
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
  client: LlmClient;
  /** Needs `{{profile}}` in the system part and `{{url}}`, `{{world_date}}`, `{{link_context}}` in the user part. */
  prompt: PromptTemplate;
  strategy: SourceStrategy;
  pages: PageStore;
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

/** Absolute http(s) URL for a generated href, or null for anything else (javascript:, mailto:, garbage). */
export function resolveHref(href: string, base: URL): string | null {
  try {
    const u = new URL(href, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export class PageService {
  private readonly inflight = new Map<string, Promise<PageResult>>();

  constructor(private readonly deps: PageServiceDeps) {}

  getPage(req: PageRequest): Promise<PageResult> {
    const key = pageCacheKey(req.url, req.profileId, req.world.seed, this.deps.strategy.id);
    let p = this.inflight.get(key);
    if (!p) {
      p = this.load(key, req).finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    return p;
  }

  private render(url: URL, content: Parameters<typeof renderPageParts>[0]): PageParts {
    return renderPageParts(content, { linkHref: (l) => resolveHref(l.href, url) ?? '#' });
  }

  private async load(key: string, req: PageRequest): Promise<PageResult> {
    const { client, prompt, strategy, pages, links } = this.deps;
    const url = normalizeUrl(req.url);
    const cached = await pages.get(key);
    if (cached) return { ok: true, cached: true, parts: this.render(req.url, cached.content) };

    await strategy.resolve(req.url, req.profile, req.world);
    const description = links.get(url);
    const outcome = await generatePageContent(client, {
      system: fillTemplate(prompt.system, { profile: describeProfile(req.profile) }),
      user: fillTemplate(prompt.user, {
        url,
        world_date: req.world.date,
        link_context: description ? `The reader arrived by following a link described as: ${description}` : '',
      }),
    });
    for (const a of outcome.attempts) this.metric(url, a.completion, a.valid);

    if (outcome.status !== 'ok') {
      const reason = outcome.status === 'refused' ? 'The model declined to write this page.' : 'The model did not return a valid page.';
      return { ok: false, parts: renderErrorParts(url, reason) };
    }

    await pages.set(key, {
      url,
      content: outcome.content,
      model: client.alias,
      promptVersion: `${prompt.name}/${prompt.version}`,
      createdAt: new Date().toISOString(),
    });
    await links.add(
      outcome.content.links.flatMap((l) => {
        const target = resolveHref(l.href, req.url);
        return target ? [{ url: normalizeUrl(target), description: l.description }] : [];
      }),
    );
    return { ok: true, cached: false, parts: this.render(req.url, outcome.content) };
  }

  private metric(url: string, c: CompletionResult, valid: boolean): void {
    this.deps.onCompletion?.({
      ts: new Date().toISOString(),
      kind: 'page',
      url,
      model: this.deps.client.alias,
      promptVersion: `${this.deps.prompt.name}/${this.deps.prompt.version}`,
      stopReason: c.stopReason,
      valid,
      ttftMs: c.ttftMs,
      totalMs: c.totalMs,
      ...c.usage,
      costUsd: c.costUsd,
    });
  }
}
