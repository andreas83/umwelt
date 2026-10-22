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

/**
 * One slot as the model sees it. Real wording is shown for short labels only; longer real text (headlines,
 * teasers, body text) is hidden so the model invents stories instead of paraphrasing the real ones.
 */
export function slotLine(s: TextSlot, label: string | null): string {
  const head = `${s.id} ${s.kind}/${s.tag}${section(s.href)} (${s.words}w)`;
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
export function copiesOriginal(slot: TextSlot, text: string): boolean {
  if (slot.kind === 'title' || slot.words <= LABEL_WORDS) return false;
  if (slot.kind === 'link' && slot.words <= 5) return false;
  if (norm(text) === norm(slot.original)) return true;
  return slot.words >= 4 && overlap(slot.original, text) > 0.6;
}

export interface FillRequest {
  template: PageTemplate;
  profile: Profile;
  worldDate: string;
  linkContext: string;
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

  const system = fillTemplate(prompt.system, { profile: describeProfile(req.profile) });
  const run = (batch: TextSlot[], i: number, total: number, retryNote: string) =>
    generateValidated(client, FillSchema, {
      system,
      user: fillTemplate(prompt.user, {
        url: template.url,
        host: template.host,
        world_date: req.worldDate,
        link_context: req.linkContext,
        outline,
        part: `${i + 1} of ${total}`,
        retry_note: retryNote,
        slots: batch.map((x) => slotLine(x, sectionOf.get(x.id) ?? null)).join('\n'),
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
        if (slot && t.text.trim() && !copiesOriginal(slot, t.text)) texts[t.id] = t.text.trim();
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
  for (const s of template.slots) if (!(s.id in texts) && s.words <= LABEL_WORDS) texts[s.id] = s.original;
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
    if (!links) return t.replace(/\[\[\d+:([^\]]*)\]\]/g, '$1');
    // `[[n:text]]` → the paragraph's n-th original link with the generated text. Unknown n → plain text.
    return t.replace(/\[\[(\d+):([^\]]*)\]\]/g, (_, n: string, label: string) => {
      const l = links.find((x) => x.n === Number(n));
      return l ? `<a href="${esc(l.href)}"${l.className ? ` class="${esc(l.className)}"` : ''}>${label}</a>` : label;
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
