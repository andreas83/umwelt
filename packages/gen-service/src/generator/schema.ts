import { z } from 'zod';

// Optional text fields are `nullish`: models often emit `null` for "absent", which is harmless.
// Fields added after pages were first cached are optional too, so old cached pages still parse.

export const PAGE_TYPES = ['news', 'forum', 'shop', 'blog', 'wiki', 'search', 'social', 'other'] as const;

/** What role the page plays on its site; drives the page template. */
export const PAGE_KINDS = ['front', 'article', 'feed', 'thread', 'listing', 'product', 'profile', 'search', 'other'] as const;

export const IMAGE_ASPECTS = ['wide', 'square', 'portrait'] as const;

/** References an entry in `images` by id. */
const imageRef = z.string().nullish();

const Block = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: z.string().min(1) }),
  z.object({ type: z.literal('list'), items: z.array(z.string().min(1)).min(1) }),
  z.object({ type: z.literal('quote'), text: z.string().min(1), cite: z.string().nullish() }),
  z.object({ type: z.literal('figure'), imageId: z.string().min(1), caption: z.string().nullish() }),
  /** Link to another page with a headline: front pages, listings, "more on this". */
  z.object({
    type: z.literal('teaser'),
    title: z.string().min(1),
    href: z.string().min(1),
    summary: z.string().nullish(),
    kicker: z.string().nullish(),
    imageId: imageRef,
  }),
  /** Forum post or comment. */
  z.object({
    type: z.literal('post'),
    author: z.string().min(1),
    date: z.string(),
    text: z.string().min(1),
    likes: z.number().nullish(),
  }),
  /** Social network post. */
  z.object({
    type: z.literal('social'),
    author: z.string().min(1),
    handle: z.string().nullish(),
    time: z.string(),
    text: z.string().min(1),
    imageId: imageRef,
    likes: z.number().nullish(),
    comments: z.number().nullish(),
    shares: z.number().nullish(),
    replies: z.array(z.object({ author: z.string().min(1), text: z.string().min(1) })).nullish(),
  }),
  z.object({
    type: z.literal('product'),
    name: z.string().min(1),
    price: z.string(),
    description: z.string(),
    href: z.string().nullish(),
    imageId: imageRef,
    rating: z.number().nullish(),
  }),
  /** Search result. */
  z.object({ type: z.literal('result'), title: z.string().min(1), url: z.string().min(1), snippet: z.string() }),
]);

export const PageContentSchema = z.object({
  siteName: z.string().min(1),
  pageType: z.enum(PAGE_TYPES),
  pageKind: z.enum(PAGE_KINDS).nullish(),
  title: z.string().min(1),
  teaser: z.string().nullish(),
  /** Hero image for articles and products. */
  leadImageId: imageRef,
  sections: z
    .array(z.object({ heading: z.string().nullish(), blocks: z.array(Block).min(1) }))
    .min(1),
  /** Outgoing links. `description` tells the generator what the target page is about. */
  links: z.array(z.object({ href: z.string().min(1), text: z.string().min(1), description: z.string().min(1) })),
  images: z
    .array(z.object({ id: z.string().min(1), prompt: z.string().min(1), alt: z.string(), aspect: z.enum(IMAGE_ASPECTS).nullish() }))
    .default([]),
});

export type PageContent = z.infer<typeof PageContentSchema>;
export type ContentBlock = z.infer<typeof Block>;
export type PageKind = (typeof PAGE_KINDS)[number];
export type ImageSpec = PageContent['images'][number];
export type ImageAspect = (typeof IMAGE_ASPECTS)[number];

/** Old cached pages have no kind; infer one from their blocks. */
export function pageKindOf(page: PageContent): PageKind {
  if (page.pageKind) return page.pageKind;
  const types = page.sections.flatMap((s) => s.blocks.map((b) => b.type));
  if (types.includes('result')) return 'search';
  if (types.filter((t) => t === 'product').length > 2) return 'listing';
  if (types.filter((t) => t === 'post').length > 3) return 'thread';
  return 'article';
}
