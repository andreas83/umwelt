import { z } from 'zod';
import { IMAGE_ASPECTS, PAGE_KINDS, PAGE_TYPES, PageContentSchema, type ContentBlock, type PageContent } from './schema.js';

/**
 * What the model is asked to output. Structured outputs compile the schema into a grammar with a size limit, and a
 * union of nine block types exceeds it — so blocks are one flat shape here and mapped onto typed blocks in code.
 */
const BLOCK_TYPES = ['paragraph', 'list', 'quote', 'figure', 'teaser', 'post', 'social', 'product', 'result'] as const;
const o = <T extends z.ZodType>(t: T) => t.optional();

const WireBlock = z.object({
  type: z.enum(BLOCK_TYPES),
  text: z.string(),
  title: o(z.string()),
  href: o(z.string()),
  author: o(z.string()),
  meta: o(z.string()),
  imageId: o(z.string()),
  items: o(z.array(z.string())),
  stats: o(z.array(z.number())),
  replies: o(z.array(z.object({ author: z.string(), text: z.string() }))),
});

export const WirePageSchema = z.object({
  siteName: z.string(),
  pageType: z.enum(PAGE_TYPES),
  pageKind: z.enum(PAGE_KINDS),
  title: z.string(),
  teaser: o(z.string()),
  leadImageId: o(z.string()),
  sections: z.array(z.object({ heading: o(z.string()), blocks: z.array(WireBlock) })),
  links: z.array(z.object({ href: z.string(), text: z.string(), description: z.string() })),
  images: z.array(z.object({ id: z.string(), prompt: z.string(), alt: z.string(), aspect: z.enum(IMAGE_ASPECTS) })),
});

type Wire = z.infer<typeof WirePageSchema>;
type WireBlockT = z.infer<typeof WireBlock>;

const blank = (s: string | undefined) => (s?.trim() ? s : undefined);

/** Flat wire block → typed block. Returns null for blocks missing what their type needs. */
export function blockFromWire(b: WireBlockT): ContentBlock | null {
  const [s0, s1, s2] = b.stats ?? [];
  switch (b.type) {
    case 'paragraph':
      return blank(b.text) ? { type: 'paragraph', text: b.text } : null;
    case 'list': {
      const items = (b.items?.length ? b.items : b.text.split('\n')).filter((i) => i.trim());
      return items.length ? { type: 'list', items } : null;
    }
    case 'quote':
      return blank(b.text) ? { type: 'quote', text: b.text, cite: blank(b.author) ?? null } : null;
    case 'figure':
      return b.imageId ? { type: 'figure', imageId: b.imageId, caption: blank(b.text) ?? null } : null;
    case 'teaser': {
      const title = blank(b.title) ?? blank(b.text);
      return title && b.href
        ? { type: 'teaser', title, href: b.href, summary: b.title ? (blank(b.text) ?? null) : null, kicker: blank(b.meta) ?? null, imageId: b.imageId ?? null }
        : null;
    }
    case 'post':
      return blank(b.text) ? { type: 'post', author: blank(b.author) ?? 'Anonymous', date: b.meta ?? '', text: b.text, likes: s0 ?? null } : null;
    case 'social': {
      // meta is "handle · time" or just the time.
      const [handle, time] = b.meta?.includes('·') ? b.meta.split('·').map((x) => x.trim()) : [undefined, b.meta];
      return blank(b.text)
        ? {
            type: 'social',
            author: blank(b.author) ?? 'Anonymous',
            handle: blank(handle) ?? null,
            time: time ?? '',
            text: b.text,
            imageId: b.imageId ?? null,
            likes: s0 ?? null,
            comments: s1 ?? null,
            shares: s2 ?? null,
            replies: b.replies?.length ? b.replies : null,
          }
        : null;
    }
    case 'product': {
      const name = blank(b.title);
      return name
        ? { type: 'product', name, price: b.meta ?? '', description: b.text, href: b.href ?? null, imageId: b.imageId ?? null, rating: s0 ?? null }
        : null;
    }
    case 'result': {
      const title = blank(b.title);
      return title && b.href ? { type: 'result', title, url: b.href, snippet: b.text } : null;
    }
  }
}

export function pageFromWire(w: Wire): PageContent {
  return PageContentSchema.parse({
    ...w,
    sections: w.sections
      .map((s) => ({ heading: s.heading ?? null, blocks: s.blocks.flatMap((b) => blockFromWire(b) ?? []) }))
      .filter((s) => s.blocks.length),
  });
}

/**
 * Validates model output and returns typed page content. Accepts the wire format (structured outputs, content/v7+)
 * and the typed format (earlier prompts, providers without structured outputs).
 */
export const WirePageContentSchema = z.union([WirePageSchema.transform(pageFromWire), PageContentSchema]);
