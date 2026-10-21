import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describeProfile, type Profile } from '@umwelt/profile';
import { defaultSkeleton, esc, renderPage } from '@umwelt/gen-service';
import { readJsonl } from './jsonl.js';
import type { GenerationRecord } from './records.js';
import type { RunDir } from './run-dir.js';
import { seededRandom, shuffle } from './stats.js';

const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

/**
 * Blind rating export: pages grouped by (url, profile), models shuffled and shown only as sample ids.
 * `key.csv` maps sample ids back to models — keep it away from raters.
 */
export async function writeGallery(run: RunDir, profiles: Profile[]): Promise<string> {
  const results = (await readJsonl<GenerationRecord>(run.results)).filter((r) => r.status === 'ok' && r.content);
  const out = join(run.dir, 'gallery');
  await mkdir(join(out, 'pages'), { recursive: true });
  const rand = seededRandom(run.meta.runId);
  const byProfile = new Map(profiles.map((p) => [p.id, p]));

  const groups = [...Map.groupBy(results, (r) => `${r.urlId}|${r.profileId}`)].sort(([a], [b]) => a.localeCompare(b));
  const key: string[] = ['sample_id,model,url_id,profile_id'];
  const ratings: string[] = ['sample_id,url,profile,rater,quality_1to5,profile_fit_1to5,plausibility_1to5,notes'];
  const sections: string[] = [];
  let n = 0;

  for (const [, group] of groups) {
    const first = group[0] as GenerationRecord;
    const profile = byProfile.get(first.profileId);
    const items: string[] = [];
    for (const r of shuffle(group, rand)) {
      const id = `s${String(++n).padStart(4, '0')}`;
      await writeFile(join(out, 'pages', `${id}.html`), renderPage(r.content!, defaultSkeleton(new URL(r.url).hostname), { linkHref: () => '#' }));
      key.push([id, r.model, r.urlId, r.profileId].join(','));
      ratings.push([id, csvCell(r.url), r.profileId, '', '', '', '', ''].join(','));
      items.push(`<li><a href="pages/${id}.html" target="_blank">${id}</a></li>`);
    }
    sections.push(`<section><h2>${esc(first.url)}</h2>
<p><strong>Profile ${esc(first.profileId)}</strong></p><pre>${esc(profile ? describeProfile(profile) : '')}</pre>
<ul class="samples">${items.join('')}</ul></section>`);
  }

  await writeFile(
    join(out, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Blind rating · ${esc(run.meta.runId)}</title>
<style>body{font:15px/1.5 system-ui;max-width:900px;margin:2rem auto;padding:0 16px}pre{background:#f4f4f4;padding:8px;white-space:pre-wrap}
.samples{display:flex;gap:12px;flex-wrap:wrap;list-style:none;padding:0}section{border-top:1px solid #ddd;padding:8px 0}</style>
<h1>Blind rating</h1><p>Open each sample, rate it in <code>ratings.csv</code> (1–5): overall quality, fit to the profile shown, plausibility as a real page. Samples in a group are the same URL and profile from different models, in random order.</p>
${sections.join('\n')}`,
  );
  await writeFile(join(out, 'ratings.csv'), ratings.join('\n') + '\n');
  await writeFile(join(run.dir, 'key.csv'), key.join('\n') + '\n');
  return out;
}
