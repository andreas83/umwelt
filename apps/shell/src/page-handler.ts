import { documentHead, esc, renderErrorParts, type PageParts, type PageRequest, type PageService } from '@umwelt/gen-service';

/** Generated pages carry no scripts; CSP is defence in depth on top of `javascript: false`. */
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'";

const LOADING_CSS = '#umwelt-loading{color:var(--muted)}#umwelt-loading h1{font-weight:500;font-size:1.3rem}';
/** Chromium waits for ~1 KB before first paint; pad the first chunk so the loading state shows immediately. */
const PAINT_PADDING = `<!--${' '.repeat(1024)}-->`;

export type RequestContext = () => Promise<Omit<PageRequest, 'url'>>;

const enc = new TextEncoder();

/**
 * Answers every http(s) request from a web tab. Page navigations stream in two steps: first the document head
 * plus — if the domain's skeleton is cached — its themed header, with a loading notice; then the content.
 * Everything else gets an empty 404.
 */
export function createPageHandler(service: PageService, context: RequestContext, unavailable: string | null) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const isPage = req.method === 'GET' && (req.headers.get('accept') ?? '').includes('text/html');
    if (!isPage) return new Response(null, { status: 404 });

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (s: string) => controller.enqueue(enc.encode(s));
        const ctx = unavailable ? null : await context();
        const skeleton = ctx ? await service.cachedSkeleton({ url, ...ctx }) : undefined;
        const early = skeleton ? service.chrome(skeleton, url) : null;

        send(documentHead(LOADING_CSS + (early?.css ?? '')));
        send(`<body class="${early?.bodyClass ?? ''}">${PAINT_PADDING}${early?.header ?? ''}`);
        send(`<div id="umwelt-loading" class="notice"><h1>Generating ${esc(url.host)}…</h1></div>`);

        let parts: PageParts;
        if (!ctx) {
          parts = renderErrorParts(url.toString(), unavailable ?? 'Unavailable.');
        } else {
          try {
            parts = (await service.getPage({ url, ...ctx })).parts;
          } catch (e) {
            console.error(`generation failed for ${url.host}:`, (e as Error).message);
            parts = renderErrorParts(url.toString(), 'Generation failed. Check the terminal for details.');
          }
        }
        // Without an early skeleton, theme and header arrive with the content.
        const late = early ? '' : `<style>${parts.css}</style>${parts.header}`;
        send(`<style>#umwelt-loading{display:none}</style><title>${esc(parts.title)}</title>${late}${parts.main}${parts.footer}</body></html>`);
        controller.close();
      },
    });
    return new Response(body, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP, 'cache-control': 'no-store' },
    });
  };
}
