import { z } from 'zod';
import { describeProfile, type Profile } from '@umwelt/profile';
import { generateValidated, type GenerateAttempt } from '../generator/generate.js';
import { fillTemplate, type PromptTemplate } from '../prompts.js';
import { esc } from '../renderer/escape.js';
import type { LlmClient } from '../router/types.js';
import type { PageTemplate, TextSlot } from './types.js';

/** Slots per model call. Calls run in parallel, so this bounds latency rather than cost. */
export const SLOTS_PER_CALL = 90;

export const FillSchema = z.object({ texts: z.array(z.object({ id: z.number(), text: z.string() })) });

export interface FillResult {
  texts: Record<number, string>;
  attempts: GenerateAttempt[];
  /** Slots the model returned nothing for. */
  missing: number;
}

/** Up to this many words, the real text is a label (section name, kicker, "more") and is shown to the model. */
export const LABEL_WORDS = 3;

/** First path segment only: article slugs would leak the real headline. */
function section(href: string | null): string {
  if (!href) return '';
  const seg = href.replace(/^https?:\/\/[^/]+/, '').split(/[/?#]/).filter(Boolean)[0];
  return seg && seg.length <= 24 && !/\d{3,}/.test(seg) ? ` →/${seg}/…` : ' →link';
}

/** `https://host/section/…` — the page's section without its slug. */
function sectionUrl(url: string): string {
  const u = new URL(url);
  const seg = u.pathname.split('/').filter(Boolean)[0];
  return `${u.origin}/${seg && seg.length <= 24 && !/\d{3,}/.test(seg) ? `${seg}/` : ''}…`;
}

/**
 * One slot as the model sees it. Real wording is shown for short labels only; longer real text (headlines,
 * teasers, body text) is hidden so the model invents stories instead of paraphrasing the real ones.
 */
/** Site name from a page title such as "Headline | Section | Site" or "Headline - Site": its last part. */
export function siteNameOf(title: string): string {
  return title.split(/\s+[|–—·-]\s+/).pop()!.trim();
}

/** A byline that is just the outlet's name ("Fox News") is furniture, not a person. */
function isOutletByline(s: TextSlot, siteName: string | null): boolean {
  return !!siteName && norm(s.original) === norm(siteName);
}

export function slotLine(s: TextSlot, label: string | null, siteName: string | null = null): string {
  const head = `${s.id} ${s.kind}/${s.tag}${section(s.href)} (${s.words}w)`;
  // Bylines name real journalists: never shown, always replaced with a fictional name.
  if (s.kind === 'byline' && !isOutletByline(s, siteName)) return `${head} [byline: a fictional author name or role, same format]`;
  // A long title carries the real headline: show only the site name.
  if (s.kind === 'title' && s.words > 5) return `${head} [tab title: this page's headline, then " | ${siteNameOf(s.original)}"]`;
  if (s.kind === 'title' || s.words <= LABEL_WORDS) return `${head}: ${s.original}`;
  // Inline link texts are labels (terms, names of other pages); the sentence around them stays hidden.
  const inline = s.links?.length
    ? ` {inline links: ${[...s.original.matchAll(/\[\[(\d+):([^\]]*)\]\]/g)].map((m) => `[[${m[1]}:${m[2]}]]`).join(' ')}}`
    : '';
  return `${head}${label ? ` [under: ${label}]` : ''}${inline}`;
}

/** For each slot, the most recent short label before it in page order: its section context. */
function labels(slots: TextSlot[]): Map<number, string> {
  const out = new Map<number, string>();
  let current: string | null = null;
  for (const s of slots) {
    if (s.kind !== 'title' && s.words <= LABEL_WORDS && (s.kind === 'headline' || s.kind === 'link')) current = s.original;
    else if (current) out.set(s.id, current);
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Share of the original's words that reappear in the candidate (0–1). */
function overlap(original: string, candidate: string): number {
  const a = norm(original).split(' ').filter((w) => w.length > 2);
  if (!a.length) return 0;
  const b = new Set(norm(candidate).split(' '));
  return a.filter((w) => b.has(w)).length / a.length;
}

/**
 * True if a generated text is too close to the real original to show. Short interface links and the tab title
 * may keep their wording; everything else must be new.
 */
export function copiesOriginal(slot: TextSlot, text: string, siteName: string | null = null): boolean {
  // A real name in a byline must not survive, however short.
  if (slot.kind === 'byline') return !isOutletByline(slot, siteName) && (norm(text) === norm(slot.original) || overlap(slot.original, text) >= 0.5);
  if (slot.words <= LABEL_WORDS || (slot.kind === 'title' && slot.words <= 5)) return false;
  // Titles keep their site name: compare only the rest.
  if (slot.kind === 'title') {
    const site = siteNameOf(slot.original);
    const strip = (t: string) => t.replace(site, '');
    return copiesOriginal({ ...slot, kind: 'headline', original: strip(slot.original), words: strip(slot.original).split(/\s+/).filter(Boolean).length }, strip(text));
  }
  if (slot.kind === 'link' && slot.words <= 5) return false;
  if (norm(text) === norm(slot.original)) return true;
  return slot.words >= 4 && overlap(slot.original, text) > 0.6;
}

export interface FillRequest {
  template: PageTemplate;
  profile: Profile;
  worldDate: string;
  linkContext: string;
  /** Show the model only the page's section, not its path: the real article slug would override a pinned topic. */
  hideUrlPath?: boolean;
}

/**
 * Generates replacement text for every slot of a template, in parallel batches. The first batch also carries the
 * page title and top of the page, so later batches stay on the same story by reading the same originals.
 */
export async function fillSlots(client: LlmClient, prompt: PromptTemplate, req: FillRequest): Promise<FillResult> {
  const { template } = req;
  const batches: TextSlot[][] = [];
  for (let i = 0; i < template.slots.length; i += SLOTS_PER_CALL) batches.push(template.slots.slice(i, i + SLOTS_PER_CALL));
  // Section names of the page, as context for what kind of site and page this is.
  const outline = [...new Set(template.slots.filter((s) => s.kind === 'headline' && s.words <= LABEL_WORDS).map((s) => s.original))]
    .slice(0, 20)
    .join(' | ');
  const sectionOf = labels(template.slots);
  const titleSlot = template.slots.find((s) => s.kind === 'title');
  const siteName = titleSlot ? siteNameOf(titleSlot.original) : null;

  const system = fillTemplate(prompt.system, { profile: describeProfile(req.profile) });
  const run = (batch: TextSlot[], i: number, total: number, retryNote: string) =>
    generateValidated(client, FillSchema, {
      system,
      user: fillTemplate(prompt.user, {
        url: req.hideUrlPath ? sectionUrl(template.url) : template.url,
        host: template.host,
        world_date: req.worldDate,
        link_context: req.linkContext,
        outline,
        part: `${i + 1} of ${total}`,
        retry_note: retryNote,
        slots: batch.map((x) => slotLine(x, sectionOf.get(x.id) ?? null, siteName)).join('\n'),
      }),
      maxTokens: 12000,
    });

  const attempts: GenerateAttempt[] = [];
  const texts: Record<number, string> = {};
  const byId = new Map(template.slots.map((s) => [s.id, s]));
  const collect = (results: Awaited<ReturnType<typeof run>>[]) => {
    for (const r of results) {
      attempts.push(...r.attempts);
      if (r.status !== 'ok') continue;
      for (const t of r.content.texts) {
        const slot = byId.get(t.id);
        if (slot && t.text.trim() && !copiesOriginal(slot, t.text, siteName)) texts[t.id] = t.text.trim();
      }
    }
  };

  collect(await Promise.all(batches.map((b, i) => run(b, i, batches.length, ''))));

  // Second pass for slots that came back empty or copied: one stricter call per batch of leftovers.
  const leftover = template.slots.filter((s) => !(s.id in texts));
  if (leftover.length) {
    const note =
      'These slots were rejected because the text was missing or repeated the original. Write entirely new content for each — different events, names and wording.';
    const retry: TextSlot[][] = [];
    for (let i = 0; i < leftover.length; i += SLOTS_PER_CALL) retry.push(leftover.slice(i, i + SLOTS_PER_CALL));
    collect(await Promise.all(retry.map((b, i) => run(b, i, retry.length, note))));
  }

  // Labels are site furniture the model was shown anyway; an empty one would leave a hole in the layout.
  for (const s of template.slots) {
    if (!(s.id in texts) && s.words <= LABEL_WORDS && (s.kind !== 'byline' || isOutletByline(s, siteName))) texts[s.id] = s.original;
  }
  return { texts, attempts, missing: template.slots.filter((s) => !(s.id in texts)).length };
}

const INDICATOR =
  '<div style="position:fixed;right:10px;bottom:10px;z-index:2147483647;background:#111;color:#fff;font:600 12px/1 system-ui,sans-serif;padding:5px 8px;border-radius:4px;opacity:.88;pointer-events:none">Generated</div>';

/**
 * Template + generated texts → document. Every inserted string is escaped. Slots without generated text are left
 * empty rather than showing the real wording. Invariant 4: the indicator is always appended.
 */
export function assemble(
  template: PageTemplate,
  texts: Record<number, string>,
  imageSrc: (slot: PageTemplate['images'][number]) => string,
  opts: { showGeneratedIndicator?: boolean } = {},
): string {
  const images = new Map(template.images.map((i) => [i.id, i]));
  const rich = new Map(template.slots.filter((s) => s.links?.length).map((s) => [s.id, s.links!]));
  const text = (id: number): string => {
    const t = esc(texts[id] ?? '');
    const links = rich.get(id);
    // `[[n:text]]` → the paragraph's n-th original link with the generated text. Unknown n → plain text.
    // The label may itself contain "]" (a footnote the model wrote as "[1]"): match up to the last "]]".
    const marker = /\[\[(\d+):(.*?)\]\](?!\])/g;
    if (!links) return t.replace(marker, '$2');
    return t.replace(marker, (_, n: string, raw: string) => {
      const l = links.find((x) => x.n === Number(n));
      if (!l) return raw;
      const label = l.footnote ? `[${raw.replace(/^\[|\]$/g, '')}]` : raw;
      return `<a href="${esc(l.href)}"${l.className ? ` class="${esc(l.className)}"` : ''}>${label}</a>`;
    });
  };
  const html = template.html
    .replace(/⟦img:(\d+)⟧/g, (_, n: string) => {
      const slot = images.get(Number(n));
      return slot ? esc(imageSrc(slot)) : '';
    })
    .replace(/⟦(\d+)⟧/g, (_, n: string) => text(Number(n)));
  const indicator = opts.showGeneratedIndicator === false ? '' : INDICATOR;
  return html.includes('</body>') ? html.replace(/<\/body>(?![\s\S]*<\/body>)/, `${indicator}</body>`) : html + indicator;
}
