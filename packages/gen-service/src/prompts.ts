import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface PromptTemplate {
  name: string;
  /** Stored with each cached page. */
  version: string;
  text: string;
}

/** Loads `prompts/<name>/<version>.md`. Versions are immutable: edit by adding a new file. */
export async function loadPrompt(promptsDir: string, name: string, version: string): Promise<PromptTemplate> {
  const text = await readFile(join(promptsDir, name, `${version}.md`), 'utf8');
  return { name, version, text };
}
