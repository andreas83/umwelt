import { z } from 'zod';

export const PAGE_TYPES = ['news', 'forum', 'shop', 'blog', 'wiki', 'search', 'other'] as const;

const Block = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: z.string().min(1) }),
  z.object({ type: z.literal('list'), items: z.array(z.string().min(1)).min(1) }),
  z.object({ type: z.literal('quote'), text: z.string().min(1), cite: z.string().optional() }),
  /** Forum post or comment. */
  z.object({ type: z.literal('post'), author: z.string().min(1), date: z.string(), text: z.string().min(1) }),
  z.object({ type: z.literal('product'), name: z.string().min(1), price: z.string(), description: z.string() }),
  /** Search result. */
  z.object({ type: z.literal('result'), title: z.string().min(1), url: z.string().min(1), snippet: z.string() }),
]);

export const PageContentSchema = z.object({
  siteName: z.string().min(1),
  pageType: z.enum(PAGE_TYPES),
  title: z.string().min(1),
  teaser: z.string().optional(),
  sections: z
    .array(z.object({ heading: z.string().optional(), blocks: z.array(Block).min(1) }))
    .min(1),
  /** Outgoing links. `description` tells the generator what the target page is about. */
  links: z.array(z.object({ href: z.string().min(1), text: z.string().min(1), description: z.string().min(1) })),
  images: z.array(z.object({ id: z.string().min(1), prompt: z.string().min(1), alt: z.string() })).default([]),
});

export type PageContent = z.infer<typeof PageContentSchema>;
export type ContentBlock = z.infer<typeof Block>;
