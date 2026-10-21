import type { LlmClient, CompletionResult } from '../router/types.js';
import { looksLikeRefusal, parseModelJson } from './parse.js';
import { PageContentSchema, type PageContent } from './schema.js';

export interface GenerateAttempt {
  completion: CompletionResult;
  valid: boolean;
  refused: boolean;
  error?: string;
}

export type GenerateOutcome =
  | { status: 'ok'; content: PageContent; attempts: GenerateAttempt[] }
  | { status: 'refused' | 'invalid'; attempts: GenerateAttempt[] };

export interface GenerateOptions {
  system: string;
  user: string;
  maxTokens?: number;
  /** Total attempts. Convention: one retry, then the error template. */
  maxAttempts?: number;
}

/** Generates page content JSON, validating with zod and retrying once on invalid output. Never retries refusals. */
export async function generatePageContent(client: LlmClient, opts: GenerateOptions): Promise<GenerateOutcome> {
  const attempts: GenerateAttempt[] = [];
  const maxAttempts = opts.maxAttempts ?? 2;

  for (let i = 0; i < maxAttempts; i++) {
    const completion = await client.complete({ system: opts.system, user: opts.user, maxTokens: opts.maxTokens ?? 8000 });
    const refused = completion.stopReason === 'refusal' || looksLikeRefusal(completion.text);
    if (refused) {
      attempts.push({ completion, valid: false, refused });
      return { status: 'refused', attempts };
    }
    const parsed = parseModelJson(completion.text, PageContentSchema);
    if (parsed.ok) {
      attempts.push({ completion, valid: true, refused: false });
      return { status: 'ok', content: parsed.value, attempts };
    }
    attempts.push({ completion, valid: false, refused: false, error: parsed.error });
  }
  return { status: 'invalid', attempts };
}
