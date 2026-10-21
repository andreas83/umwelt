import type { Pricing } from './config.js';
import type { CompletionUsage } from './types.js';

/** Fallback when a model has no explicit cached-input price. */
const DEFAULT_CACHE_DISCOUNT = 0.1;

export function costUsd(usage: CompletionUsage, pricing: Pricing): number {
  const cachedPrice = pricing.cachedInput ?? pricing.input * DEFAULT_CACHE_DISCOUNT;
  const uncached = usage.inputTokens - usage.cachedInputTokens;
  return (uncached * pricing.input + usage.cachedInputTokens * cachedPrice + usage.outputTokens * pricing.output) / 1e6;
}
