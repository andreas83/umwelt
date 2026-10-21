import type { z } from 'zod';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Pulls the outermost JSON object out of model text, tolerating code fences and stray prose. */
export function extractJson(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start === -1 || end <= start ? null : text.slice(start, end + 1);
}

export function parseModelJson<S extends z.ZodType>(text: string, schema: S): ParseResult<z.infer<S>> {
  const json = extractJson(text);
  if (json === null) return { ok: false, error: 'no JSON object in output' };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${(e as Error).message}` };
  }
  const parsed = schema.safeParse(data);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}

const REFUSAL = /\b(I can(?:'|’)?t|I cannot|I(?:'|’)m (?:not able|unable)|I won(?:'|’)t|I must decline|not comfortable)\b/i;

/** Heuristic for providers that refuse in plain text instead of a stop reason. */
export function looksLikeRefusal(text: string): boolean {
  return extractJson(text) === null && REFUSAL.test(text.slice(0, 400));
}
