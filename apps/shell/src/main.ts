import { appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, protocol, safeStorage, type IpcMainInvokeEvent } from 'electron';
import {
  FileLinkStore,
  FilePageStore,
  loadModelsConfig,
  loadPrompt,
  MissingApiKeyError,
  ModelRouter,
  PageService,
  pureGen,
  type CompletionMetric,
  type LlmClient,
} from '@umwelt/gen-service';
import { EncryptedProfileStore, profileCacheId, type Cipher, type Profile } from '@umwelt/profile';
import { addressToUrl } from './address.js';
import { internalHandler } from './internal-protocol.js';
import { createPageHandler } from './page-handler.js';
import { envPath, modelsConfigPath, preloadPath, promptsDir } from './paths.js';
import { setupInternalSession, setupWebSession } from './sessions.js';
import { loadSettings } from './settings-store.js';
import { runSmoke } from './smoke.js';
import { IPC, type ProfileForm } from './shared/ipc.js';
import { NEW_TAB_URL, SETTINGS_URL, TabManager } from './tabs.js';

/** Content prompt used by the browser. Stored with each cached page. */
const CONTENT_PROMPT = ['content', 'v3'] as const;

// Must run before `ready`. Note: no top-level await before `ready` either — in an ESM main, Electron
// only emits `ready` once the entry module's top-level awaits have settled, so awaiting it deadlocks.
app.setName('Umwelt');
protocol.registerSchemesAsPrivileged([{ scheme: 'umwelt', privileges: { standard: true, secure: true } }]);
if (existsSync(envPath)) process.loadEnvFile(envPath);

const cipher: Cipher = {
  async encrypt(plain) {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error('No OS keychain available to encrypt the profile.');
    return safeStorage.encryptStringAsync(plain);
  },
  async decrypt(data) {
    return (await safeStorage.decryptStringAsync(data)).result;
  },
};

async function start(): Promise<void> {
  const userData = app.getPath('userData');
  const settings = await loadSettings(join(userData, 'settings.json'));
  const profileStore = new EncryptedProfileStore(join(userData, 'profile.enc'), cipher);
  let profile: Profile = await profileStore.load();
  if (safeStorage.getSelectedStorageBackend() === 'basic_text') {
    console.warn('warning: no OS keychain found; the profile is only obfuscated at rest, not encrypted.');
  }

  let client: LlmClient | null = null;
  let unavailable: string | null = null;
  try {
    client = new ModelRouter(await loadModelsConfig(modelsConfigPath)).forRole('content');
  } catch (e) {
    if (!(e instanceof MissingApiKeyError)) throw e;
    unavailable = `${e.message}, then restart Umwelt.`;
  }

  const metricsPath = join(userData, 'metrics.jsonl');
  const service = new PageService({
    client: client ?? ({ alias: 'none', complete: () => Promise.reject(new Error(unavailable ?? '')) } satisfies LlmClient),
    prompt: await loadPrompt(promptsDir, ...CONTENT_PROMPT),
    strategy: pureGen,
    pages: new FilePageStore(join(userData, 'pages')),
    links: await FileLinkStore.open(join(userData, 'links.json')),
    onCompletion: (m: CompletionMetric) => void appendFile(metricsPath, JSON.stringify(m) + '\n'),
  });

  const internalSession = setupInternalSession(internalHandler);
  const webSession = setupWebSession(
    createPageHandler(
      service,
      async () => ({ profile, profileId: profileCacheId(profile), world: { seed: settings.worldSeed, date: settings.worldDate } }),
      unavailable,
    ),
  );

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Umwelt',
    webPreferences: { preload: preloadPath, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  const tabs = new TabManager(win, webSession);

  /** IPC is only honoured from internal pages (chrome UI, settings); web tabs have no preload anyway. */
  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R) =>
    ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (e.sender.session !== internalSession) throw new Error('forbidden');
      return fn(...(args as A));
    });

  const toTarget = (input: string) => {
    const url = addressToUrl(input);
    if (url.startsWith('umwelt://')) return url === 'umwelt://settings' ? SETTINGS_URL : NEW_TAB_URL;
    return url;
  };

  handle(IPC.newTab, (input?: string) => tabs.open(input ? toTarget(input) : NEW_TAB_URL));
  handle(IPC.closeTab, (id: number) => tabs.close(id));
  handle(IPC.selectTab, (id: number) => tabs.select(id));
  handle(IPC.navigate, (input: string) => tabs.navigate(toTarget(input)));
  handle(IPC.back, () => tabs.back());
  handle(IPC.forward, () => tabs.forward());
  handle(IPC.reload, () => tabs.reload());
  handle(IPC.openSettings, () => tabs.open(SETTINGS_URL));
  handle(IPC.getProfile, (): ProfileForm => profile);
  handle(IPC.saveProfile, async (form: ProfileForm) => {
    try {
      profile = await profileStore.save({ ...profile, ...form });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

  await win.loadURL('umwelt://app/chrome.html');
  tabs.open(NEW_TAB_URL);
  win.webContents.on('did-finish-load', () => win.webContents.send(IPC.state, tabs.state()));
  app.on('window-all-closed', () => app.quit());
  await runSmoke(win, (u) => tabs.navigate(u), () => tabs.activeContents());
}

app.whenReady().then(start).catch((e: unknown) => {
  console.error(e);
  app.exit(1);
});
