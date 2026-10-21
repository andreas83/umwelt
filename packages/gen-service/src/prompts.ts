import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface PromptTemplate {
  name: string;
  /** Stored with each cached page. */
  version: string;
  /** Stable prefix: sent as the system prompt. */
  system: string;
  /** Per-request part, after the `=== user ===` marker. Empty if the file has none. */
  user: string;
}

const USER_MARKER = /^=== user ===$/m;

/** Loads `prompts/<name>/<version>.md`. Versions are immutable: edit by adding a new file. */
export async function loadPrompt(promptsDir: string, name: string, version: string): Promise<PromptTemplate> {
  const text = await readFile(join(promptsDir, name, `${version}.md`), 'utf8');
  const [system = '', user = ''] = text.split(USER_MARKER);
  return { name, version, system: system.trim(), user: user.trim() };
}

/** Fills `{{name}}` placeholders. Throws on a missing variable so a half-filled prompt is never sent. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined) throw new Error(`prompt variable "${key}" not provided`);
    return v;
  });
}
