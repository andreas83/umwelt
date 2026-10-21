import { session, type Session } from 'electron';

export const WEB_PARTITION = 'persist:umwelt-web';

const blocked = () => new Response('Network access is disabled in Umwelt.', { status: 403 });

/** Common lockdown: no permissions, no downloads, no non-http(s) schemes such as ws:, ftp:, file:. */
function lockDown(ses: Session, allowedSchemes: string[]): void {
  ses.webRequest.onBeforeRequest((details, cb) => {
    const scheme = details.url.slice(0, details.url.indexOf(':') + 1);
    cb({ cancel: !allowedSchemes.includes(scheme) });
  });
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', (e) => e.preventDefault());
}

/**
 * Invariant 1: generated pages never reach the network. http(s) is answered by the page handler;
 * every other scheme (ws:, wss:, ftp:, file:, …) is cancelled.
 */
export function setupWebSession(pageHandler: (req: Request) => Promise<Response>): Session {
  const ses = session.fromPartition(WEB_PARTITION);
  ses.protocol.handle('http', pageHandler);
  ses.protocol.handle('https', pageHandler);
  lockDown(ses, ['http:', 'https:', 'data:']);
  return ses;
}

/** The default session hosts the chrome UI and internal pages: umwelt:// only, http(s) answered with 403. */
export function setupInternalSession(internalHandler: (req: Request) => Promise<Response>): Session {
  const ses = session.defaultSession;
  ses.protocol.handle('umwelt', internalHandler);
  ses.protocol.handle('http', blocked);
  ses.protocol.handle('https', blocked);
  lockDown(ses, ['umwelt:', 'devtools:', 'data:']);
  return ses;
}
