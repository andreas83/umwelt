import { describe, expect, it } from 'vitest';
import { fillTemplate, loadPrompt } from './prompts.js';

const promptsDir = new URL('../../../prompts', import.meta.url).pathname;

describe('prompts', () => {
  it('fills placeholders and rejects missing ones', () => {
    expect(fillTemplate('a {{x}} b', { x: '1' })).toBe('a 1 b');
    expect(() => fillTemplate('{{y}}', {})).toThrow(/"y"/);
  });

  it.each(['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'])('splits system and user parts of content/%s', async (version) => {
    const p = await loadPrompt(promptsDir, 'content', version);
    expect(p.system).toContain('{{profile}}');
    expect(p.user).toContain('{{url}}');
    expect(p.system).not.toContain('{{url}}'); // per-request data stays out of the cacheable prefix
  });
});

describe('skeleton prompt', () => {
  it.each(['v1', 'v2'])('keeps per-domain data out of the system part of skeleton/%s', async (version) => {
    const p = await loadPrompt(promptsDir, 'skeleton', version);
    expect(p.system).toContain('{{profile}}');
    expect(p.user).toContain('{{host}}');
    expect(p.system).not.toContain('{{host}}');
  });
});

describe('rewrite prompt', () => {
  it.each(['v1', 'v2', 'v3', 'v4'])('keeps page data out of the system part of rewrite/%s', async (version) => {
    const p = await loadPrompt(promptsDir, 'rewrite', version);
    expect(p.system).toContain('{{profile}}');
    expect(p.user).toContain('{{slots}}');
    expect(p.system).not.toMatch(/\{\{(url|slots|host)\}\}/);
  });
});

