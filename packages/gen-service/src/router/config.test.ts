import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseModelsConfig } from './config.js';

describe('models.yaml', () => {
  it('repo config is valid', () => {
    const text = readFileSync(new URL('../../../../config/models.yaml', import.meta.url), 'utf8');
    expect(parseModelsConfig(text).roles.planner).toBeDefined();
  });

  it('rejects unknown providers', () => {
    expect(() => parseModelsConfig('providers: {}\nroles:\n  planner: { provider: x, model: m }')).toThrow(/unknown provider/);
  });
});
