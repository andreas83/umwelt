import { describe, expect, it } from 'vitest';
import { costUsd } from './cost.js';

describe('costUsd', () => {
  it('prices cached input separately', () => {
    const usage = { inputTokens: 1_000_000, cachedInputTokens: 500_000, outputTokens: 1_000_000 };
    expect(costUsd(usage, { input: 2, output: 10, cachedInput: 0.2 })).toBeCloseTo(1 + 0.1 + 10);
  });

  it('falls back to a 90% cache discount', () => {
    const usage = { inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 };
    expect(costUsd(usage, { input: 1, output: 1 })).toBeCloseTo(0.1);
  });
});
