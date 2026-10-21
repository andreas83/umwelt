import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** Dev layout: apps/shell/dist/*.js. Packaged builds will need their own resolution (Phase 8). */
export const shellRoot = fileURLToPath(new URL('../', import.meta.url));
export const repoRoot = join(shellRoot, '../..');
export const staticDir = join(shellRoot, 'static');
export const uiDistDir = join(shellRoot, 'dist/ui');
export const preloadPath = join(shellRoot, 'dist/preload.cjs');
export const promptsDir = join(repoRoot, 'prompts');
export const modelsConfigPath = join(repoRoot, 'config/models.yaml');
export const envPath = join(repoRoot, '.env');
