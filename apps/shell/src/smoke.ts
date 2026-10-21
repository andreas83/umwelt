import { writeFile } from 'node:fs/promises';
import type { BrowserWindow, WebContents } from 'electron';

/**
 * Dev-only: `UMWELT_SMOKE_URL=… UMWELT_SMOKE_OUT=dir pnpm dev` opens the URL, waits for the generated page,
 * writes chrome.png + page.png into the dir, and quits.
 */
export async function runSmoke(win: BrowserWindow, open: (url: string) => void, active: () => WebContents | undefined): Promise<void> {
  const url = process.env.UMWELT_SMOKE_URL;
  const out = process.env.UMWELT_SMOKE_OUT;
  if (!url || !out) return;
  open(url);
  const deadline = Date.now() + 120_000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 500));
    const wc = active();
    if (wc && !wc.isLoading() && wc.getURL() && !wc.getURL().endsWith('newtab.html')) break;
    if (Date.now() > deadline) throw new Error('smoke: timed out');
  }
  await new Promise((r) => setTimeout(r, 500));
  await writeFile(`${out}/chrome.png`, (await win.webContents.capturePage()).toPNG());
  await writeFile(`${out}/page.png`, (await active()!.capturePage()).toPNG());
  console.log(`smoke: ${active()!.getTitle()}`);
  win.close();
}
