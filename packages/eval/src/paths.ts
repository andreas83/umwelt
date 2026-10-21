import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** Same depth from `src/` and `dist/`. */
export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const evalDataDir = join(repoRoot, 'packages/eval/data');
export const promptsDir = join(repoRoot, 'prompts');
export const modelsConfigPath = join(repoRoot, 'config/models.yaml');
export const runsDir = join(repoRoot, 'data/eval');
