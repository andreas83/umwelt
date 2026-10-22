import { describe, expect, it } from 'vitest';
import { WirePageContentSchema, blockFromWire } from './wire.js';

describe('wire format', () => {
  it('maps flat blocks onto typed blocks', () => {
    expect(blockFromWire({ type: 'social', text: 'Hi', author: 'Ada', meta: '@ada · 2h', stats: [10, 2, 1] })).toEqual({
      type: 'social', author: 'Ada', handle: '@ada', time: '2h', text: 'Hi', imageId: null, likes: 10, comments: 2, shares: 1, replies: null,
    });
    expect(blockFromWire({ type: 'teaser', text: 'Summary', title: 'Head', href: '/a', meta: 'Politics' })).toMatchObject({
      type: 'teaser', title: 'Head', summary: 'Summary', kicker: 'Politics',
    });
    expect(blockFromWire({ type: 'product', text: 'Nice', title: 'Mug', meta: '$9', stats: [4.5] })).toMatchObject({ name: 'Mug', price: '$9', rating: 4.5 });
    expect(blockFromWire({ type: 'teaser', text: 'no href' })).toBeNull();
  });

  it('drops empty sections and validates the result', () => {
    const r = WirePageContentSchema.safeParse({
      siteName: 'S', pageType: 'news', pageKind: 'front', title: 'T', links: [], images: [],
      sections: [{ blocks: [{ type: 'paragraph', text: '' }] }, { blocks: [{ type: 'paragraph', text: 'ok' }] }],
    });
    expect(r.success && r.data.sections).toHaveLength(1);
  });
});
