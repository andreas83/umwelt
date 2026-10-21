import type { z } from 'zod';
import type { CompletionResult, LlmClient } from '../router/types.js';
import { looksLikeRefusal, parseModelJson } from './parse.js';
import { PageContentSchema, type PageContent } from './schema.js';

export interface GenerateAttempt {
  completion: CompletionResult;
  valid: boolean;
  refused: boolean;
  error?: string;
}

export type GenerateOutcome<T> =
  | { status: 'ok'; content: T; attempts: GenerateAttempt[] }
  | { status: 'refused' | 'invalid'; attempts: GenerateAttempt[] };

export interface GenerateOptions {
  system: string;
  user: string;
  maxTokens?: number;
  /** Total attempts. Convention: one retry, then the error template. */
  maxAttempts?: number;
}

/** Generates JSON matching `schema`, retrying once on invalid output. Never retries refusals; never returns unvalidated output. */
export async function generateValidated<S extends z.ZodType>(
  client: LlmClient,
  schema: S,
  opts: GenerateOptions,
): Promise<GenerateOutcome<z.infer<S>>> {
  const attempts: GenerateAttempt[] = [];
  const maxAttempts = opts.maxAttempts ?? 2;

  for (let i = 0; i < maxAttempts; i++) {
    const completion = await client.complete({
      system: opts.system,
      user: opts.user,
      maxTokens: opts.maxTokens ?? 8000,
      responseSchema: schema,
    });
    const refused = completion.stopReason === 'refusal' || looksLikeRefusal(completion.text);
    if (refused) {
      attempts.push({ completion, valid: false, refused });
      return { status: 'refused', attempts };
    }
    const parsed = parseModelJson(completion.text, schema);
    if (parsed.ok) {
      attempts.push({ completion, valid: true, refused: false });
      return { status: 'ok', content: parsed.value, attempts };
    }
    attempts.push({ completion, valid: false, refused: false, error: parsed.error });
  }
  return { status: 'invalid', attempts };
}

export function generatePageContent(client: LlmClient, opts: GenerateOptions): Promise<GenerateOutcome<PageContent>> {
  return generateValidated(client, PageContentSchema, opts);
}
