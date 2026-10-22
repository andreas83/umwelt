import { BrowserWindow, session, type Session } from 'electron';
import type { FetchedResource, PageSnapshotter, RawSnapshot, ResourceFetcher, StyleProbe } from '@umwelt/gen-service';

/**
 * The only session that reaches real sites (modes B and C). In-memory partition: no cookies or storage survive
 * a restart. Never shown, never used for generated pages.
 */
export function createFetchSession(): Session {
  const ses = session.fromPartition('umwelt-fetch');
  // A plain Chrome user agent; "Electron/…" gets bot-blocked more often.
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|Umwelt|@umwelt\/shell)\/\S+/g, ''));
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', (e) => e.preventDefault());
  return ses;
}

const MAX_RESOURCE_BYTES = 3_000_000;

export class SessionFetcher implements ResourceFetcher {
  constructor(private readonly ses: Session) {}

  async fetch(url: string): Promise<FetchedResource | null> {
    if (!/^https?:\/\//.test(url)) return null;
    try {
      const res = await this.ses.fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > MAX_RESOURCE_BYTES) return null;
      return { contentType: (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0]!.trim(), bytes };
    } catch {
      return null;
    }
  }
}

/** Runs in the real page: trigger lazy content, then remove cookie walls and scroll locks. */
const SETTLE = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Consent dialogs: decline if offered, otherwise accept. The session is in-memory, so nothing persists.
  const buttons = [...document.querySelectorAll('button, [role=button], a')].filter((b) => b.offsetParent !== null);
  const label = (b) => (b.textContent || '').trim().replace(/\\s+/g, ' ');
  const pick = (re) => buttons.find((b) => label(b).length < 40 && re.test(label(b)));
  const choice =
    pick(/^(alle )?(ablehnen|optionale cookies ablehnen|nur (notwendige|erforderliche)|reject( all)?|decline( all)?|deny|refuse|only necessary)/i) ||
    pick(/^(alle (cookies )?(akzeptieren|erlauben|zulassen)|accept( all)?( cookies)?|allow all( cookies)?|agree|i agree|zustimmen|einverstanden|akzeptieren)/i);
  if (choice) { choice.click(); await sleep(1500); }
  for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < 12; y += innerHeight, i++) { scrollTo(0, y); await sleep(250); }
  scrollTo(0, 0);
  await sleep(500);
  const words = /cookie|consent|zustimm|einwillig|accept|akzeptier|privacy|datenschutz|tracking|werbefrei/i;
  for (const el of [...document.querySelectorAll('body *')]) {
    const cs = getComputedStyle(el);
    if ((cs.position === 'fixed' || cs.position === 'sticky') && (Number(cs.zIndex) || 0) > 10) {
      const r = el.getBoundingClientRect();
      if (r.width * r.height > innerWidth * innerHeight * 0.15 && words.test(el.textContent || '')) el.remove();
    }
  }
  for (const el of [document.documentElement, document.body]) {
    el.style.removeProperty('overflow');
    el.style.removeProperty('position');
    el.classList.remove(...[...el.classList].filter((c) => /no-?scroll|modal-open|overflow-hidden|sp-message-open|cmp|consent/i.test(c)));
  }
  return true;
})()`;

/** Runs in the real page: the rendered DOM, stylesheets in document order, and the look for mode C. */
const COLLECT = `(() => {
  const rulesText = (s) => { try { return [...s.cssRules].map((r) => r.cssText).join('\\n'); } catch { return null; } };
  const stylesheets = [...document.styleSheets].map((s) => {
    const inline = s.ownerNode && s.ownerNode.tagName === 'STYLE';
    return { href: inline ? null : s.href, text: inline ? ((s.ownerNode.textContent || '').trim() || rulesText(s)) : null, media: s.media.mediaText };
  });
  for (const s of document.adoptedStyleSheets || []) stylesheets.push({ href: null, text: rulesText(s), media: '' });
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const header = document.querySelector('header, [role=banner]');
  const seen = new Set();
  const nav = [...document.querySelectorAll('nav a, header a')]
    .map((a) => ({ text: (a.textContent || '').trim().replace(/\\s+/g, ' '), href: a.href }))
    .filter((l) => l.text && l.text.length <= 30 && /^https?:/.test(l.href) && !seen.has(l.text) && seen.add(l.text))
    .slice(0, 8);
  const siteName = document.querySelector('meta[property="og:site_name"]');
  return {
    html: document.documentElement.outerHTML,
    title: document.title,
    finalUrl: location.href,
    stylesheets,
    probe: {
      siteName: (siteName && siteName.content) || '',
      background: cs(document.body).backgroundColor,
      text: cs(document.body).color,
      link: (cs(document.querySelector('main a, article a, a')) || {}).color || '',
      headerBackground: header ? cs(header).backgroundColor : null,
      fontBody: cs(document.body).fontFamily,
      fontHeading: (cs(document.querySelector('h1, h2')) || {}).fontFamily || null,
      nav,
    },
  };
})()`;

const timeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);

/** Loads real pages in hidden offscreen windows, at most `concurrency` at a time. */
export class WindowSnapshotter implements PageSnapshotter {
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly ses: Session,
    private readonly concurrency = 2,
  ) {}

  async snapshot(url: string): Promise<RawSnapshot> {
    if (this.running >= this.concurrency) await new Promise<void>((r) => this.waiting.push(r));
    this.running++;
    try {
      return await this.take(url);
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }

  private async take(url: string): Promise<RawSnapshot> {
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: { session: this.ses, offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    const wc = win.webContents;
    wc.setAudioMuted(true);
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    let status = 200;
    wc.on('did-navigate', (_e, _url, code) => {
      if (code) status = code;
    });
    try {
      // Pages with endless background requests never "finish"; snapshot whatever is there after the timeout.
      await timeout(
        wc.loadURL(url).catch((e: { code?: string }) => {
          if (e.code !== 'ERR_ABORTED') throw e;
        }),
        15_000,
      );
      if (!wc.getURL()) throw new Error('page did not load');
      await timeout(wc.executeJavaScript(SETTLE), 8_000);
      const data = (await wc.executeJavaScript(COLLECT)) as Omit<RawSnapshot, 'url' | 'status'> & { probe: StyleProbe };
      return { url, status, ...data };
    } finally {
      win.destroy();
    }
  }
}
