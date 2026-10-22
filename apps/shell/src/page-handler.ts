import {
  ASSET_HOST,
  BASE_CSS,
  documentHead,
  esc,
  IMAGE_HOST,
  type AssetStore,
  renderErrorParts,
  type ImageService,
  type PageParts,
  type PageRequest,
  type PageService,
} from '@umwelt/gen-service';

/** Generated pages carry no scripts; CSP is defence in depth on top of `javascript: false`. */
const CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  `img-src data: https://${IMAGE_HOST} https://${ASSET_HOST}`,
  `font-src data: https://${ASSET_HOST}`,
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

/** Prelude for mode B: no site styles yet, just a full-screen loading notice above whatever follows. */
const NEUTRAL_HEAD =
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<style>html{overflow-anchor:none}#umwelt-loading{position:fixed;inset:0;display:grid;place-items:center;background:#fff;color:#666;font:500 18px system-ui,sans-serif;z-index:2147483646}</style></head>';

const LOADING_CSS = '#umwelt-loading{color:var(--muted)}#umwelt-loading h1{font-weight:500;font-size:1.3rem}';
/** Chromium waits for ~1 KB before first paint; pad the first chunk so the loading state shows immediately. */
const PAINT_PADDING = `<!--${' '.repeat(1024)}-->`;

export type RequestContext = () => Promise<Omit<PageRequest, 'url'>>;

const enc = new TextEncoder();

/**
 * Answers every http(s) request from a web tab. Page navigations stream in two steps: first the document head
 * plus — if the domain's skeleton is cached — its themed header, with a loading notice; then the content.
 * Images on the reserved image host come from the image service. Everything else gets an empty 404.
 */
export function createPageHandler(
  service: PageService,
  images: ImageService,
  assets: AssetStore | null,
  context: RequestContext,
  unavailable: string | null,
) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (url.host === ASSET_HOST) {
      const asset = await assets?.get(url.pathname.slice(1));
      return asset
        ? new Response(asset.bytes as Uint8Array<ArrayBuffer>, { headers: { 'content-type': asset.contentType, 'cache-control': 'max-age=31536000' } })
        : new Response(null, { status: 404 });
    }
    if (url.host === IMAGE_HOST) {
      const img = await images.serve(url.pathname.slice(1))?.catch(() => undefined);
      return img
        ? new Response(img.bytes as Uint8Array<ArrayBuffer>, { headers: { 'content-type': img.contentType, 'cache-control': 'max-age=86400' } })
        : new Response(null, { status: 404 });
    }
    const isPage = req.method === 'GET' && (req.headers.get('accept') ?? '').includes('text/html');
    if (!isPage) return new Response(null, { status: 404 });

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (s: string) => controller.enqueue(enc.encode(s));
        const ctx = unavailable ? null : await context();
        const skeleton = ctx && service.streamsChromeEarly ? await service.cachedSkeleton({ url, ...ctx }) : undefined;
        const early = skeleton ? service.chrome(skeleton, url) : null;

        if (service.streamsChromeEarly) {
          send(documentHead(LOADING_CSS + (early?.css ?? '')));
          send(`<body class="${early?.bodyClass ?? ''}">${PAINT_PADDING}${early?.header ?? ''}`);
        } else {
          send(`${NEUTRAL_HEAD}<body>${PAINT_PADDING}`);
        }
        send(`<div id="umwelt-loading" class="notice"><h1>Generating ${esc(url.host)}…</h1></div>`);

        let result: Awaited<ReturnType<PageService['getPage']>> | null = null;
        let parts: PageParts | null = null;
        if (!ctx) {
          parts = renderErrorParts(url.toString(), unavailable ?? 'Unavailable.');
        } else {
          try {
            result = await service.getPage({ url, ...ctx });
            if ('parts' in result) parts = result.parts;
          } catch (e) {
            console.error(`generation failed for ${url.host}:`, (e as Error).message);
            parts = renderErrorParts(url.toString(), 'Generation failed. Check the terminal for details.');
          }
        }
        const hide = '<style>#umwelt-loading{display:none}</style>';
        if (result && 'document' in result) {
          // The rewritten page follows the prelude; the parser merges its <html>/<body> attributes and keeps its styles.
          send(hide + result.document);
        } else if (parts) {
          if (early) {
            send(`${hide}<title>${esc(parts.title)}</title>${parts.main}${parts.footer}</body></html>`);
          } else {
            // Theme, layout classes and header arrive with the content. The classes go on a wrapper: the <body> tag
            // is already out, and every layout selector works with any ancestor carrying them.
            send(
              `${hide}<title>${esc(parts.title)}</title><style>${service.streamsChromeEarly ? '' : BASE_CSS}${parts.css}</style>` +
                `<div class="${parts.bodyClass}">${parts.header}${parts.main}${parts.footer}</div></body></html>`,
            );
          }
        }
        controller.close();
      },
    });
    return new Response(body, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP, 'cache-control': 'no-store' },
    });
  };
}
