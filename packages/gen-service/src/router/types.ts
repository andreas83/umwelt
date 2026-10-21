import type { z } from 'zod';

export interface CompletionRequest {
  /** Stable prefix (instructions + profile). Sent as the system prompt and marked cacheable where supported. */
  system: string;
  user: string;
  maxTokens: number;
  /**
   * Expected JSON shape. Models with `structuredOutput: true` in the catalog are constrained to it by the
   * provider; for the rest it is ignored. Callers validate either way.
   */
  responseSchema?: z.ZodType;
  signal?: AbortSignal;
  onText?: (delta: string) => void;
}

export interface CompletionUsage {
  /** All input tokens, including cached ones. */
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface CompletionResult {
  text: string;
  /** Normalized: 'end' | 'max_tokens' | 'refusal' | provider-specific value. */
  stopReason: string;
  usage: CompletionUsage;
  /** Time to first text token, ms. `null` if no text arrived. */
  ttftMs: number | null;
  totalMs: number;
  costUsd: number;
}

export interface LlmClient {
  /** Catalog alias, e.g. `haiku-5-5`. */
  alias: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}
