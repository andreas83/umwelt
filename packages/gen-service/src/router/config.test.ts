import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseModelsConfig } from './config.js';

const base = `
providers:
  p: { kind: openai-compatible, baseUrl: https://example.com/v1, apiKeyEnv: K }
models:
  m: { provider: p, model: x, pricing: { input: 1, output: 2 } }
`;

describe('models.yaml', () => {
  it('repo config is valid', () => {
    const text = readFileSync(new URL('../../../../config/models.yaml', import.meta.url), 'utf8');
    const cfg = parseModelsConfig(text);
    expect(cfg.roles.planner).toBeDefined();
    expect(cfg.eval.candidates.length).toBeGreaterThan(0);
  });

  it('rejects unknown providers', () => {
    expect(() => parseModelsConfig(base.replace('provider: p', 'provider: nope') + 'roles: {}')).toThrow(/unknown provider/);
  });

  it('rejects roles pointing at unknown models', () => {
    expect(() => parseModelsConfig(base + 'roles: { planner: ghost }')).toThrow(/unknown model .*ghost/);
  });
});
