import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { extractJson, looksLikeRefusal, parseModelJson } from './parse.js';

describe('parseModelJson', () => {
  const schema = z.object({ a: z.number() });

  it('strips code fences and prose', () => {
    expect(extractJson('Sure:\n```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(parseModelJson('```json\n{"a":1}\n```', schema)).toEqual({ ok: true, value: { a: 1 } });
  });

  it('reports schema errors with paths', () => {
    const r = parseModelJson('{"a":"x"}', schema);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/^a:/);
  });

  it('reports truncated JSON', () => {
    expect(parseModelJson('{"a": 1, "b": {"c"', schema).ok).toBe(false);
  });
});

describe('looksLikeRefusal', () => {
  it('flags plain-text refusals but not JSON pages', () => {
    expect(looksLikeRefusal("I can't help create content like that.")).toBe(true);
    expect(looksLikeRefusal('{"title":"I can\'t stop reading this"}')).toBe(false);
  });
});

describe('PageContentSchema', () => {
  it('accepts null for optional text fields', async () => {
    const { PageContentSchema } = await import('./schema.js');
    const page = {
      siteName: 's', pageType: 'news', title: 't', teaser: null, links: [],
      sections: [{ heading: null, blocks: [{ type: 'quote', text: 'q', cite: null }] }],
    };
    expect(PageContentSchema.safeParse(page).success).toBe(true);
  });
});
