import { app, BrowserWindow, protocol } from 'electron';

// Invariant 1: the renderer never reaches the network. Every http/https request is answered locally.
function interceptWeb(): void {
  const handler = (req: Request): Response =>
    new Response(placeholderPage(new URL(req.url)), { headers: { 'content-type': 'text/html; charset=utf-8' } });
  protocol.handle('http', handler);
  protocol.handle('https', handler);
}

function placeholderPage(url: URL): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><meta charset="utf-8"><title>${esc(url.hostname)} · Umwelt</title>
<body style="font-family:system-ui;padding:2rem">
<p><strong>Generated</strong> · ${esc(url.toString())}</p>
<p>Generation pipeline not wired up yet.</p>`;
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Umwelt',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  await win.loadURL('https://example.com/');
}

await app.whenReady();
interceptWeb();
await createWindow();
app.on('window-all-closed', () => app.quit());
