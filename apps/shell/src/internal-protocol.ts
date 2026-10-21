import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { staticDir, uiDistDir } from './paths.js';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function resolveIn(root: string, rel: string): string | null {
  const file = normalize(join(root, rel));
  return file.startsWith(root + sep) ? file : null;
}

/** Serves `umwelt://app/…`: `/ui/*` from compiled UI scripts, everything else from `static/`. */
export async function internalHandler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.host !== 'app') return new Response(null, { status: 404 });
  const path = decodeURIComponent(url.pathname);
  const file = path.startsWith('/ui/') ? resolveIn(uiDistDir, path.slice(4)) : resolveIn(staticDir, path.slice(1));
  if (!file) return new Response(null, { status: 404 });
  try {
    return new Response(await readFile(file), { headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' } });
  } catch {
    return new Response(null, { status: 404 });
  }
}
