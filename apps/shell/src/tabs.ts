import { BrowserWindow, WebContentsView, type Session } from 'electron';
import type { ShellState, TabState } from './shared/ipc.js';
import { preloadPath } from './paths.js';

export const CHROME_HEIGHT = 76;
export const NEW_TAB_URL = 'umwelt://app/newtab.html';
export const SETTINGS_URL = 'umwelt://app/settings.html';

const isWeb = (url: string) => /^https?:\/\//i.test(url);

interface Tab {
  id: number;
  view: WebContentsView;
  internal: boolean;
}

export class TabManager {
  private readonly tabs: Tab[] = [];
  private activeId: number | null = null;
  private nextId = 1;

  constructor(
    private readonly win: BrowserWindow,
    private readonly webSession: Session,
  ) {
    win.on('resize', () => this.layout());
  }

  open(url: string): void {
    const tab = this.createTab(url);
    this.tabs.push(tab);
    this.select(tab.id);
  }

  close(id: number): void {
    const i = this.tabs.findIndex((t) => t.id === id);
    const tab = this.tabs[i];
    if (!tab) return;
    this.win.contentView.removeChildView(tab.view);
    tab.view.webContents.close();
    this.tabs.splice(i, 1);
    if (!this.tabs.length) return this.open(NEW_TAB_URL);
    if (this.activeId === id) this.select((this.tabs[i] ?? this.tabs[i - 1] ?? this.tabs[0])!.id);
    else this.emit();
  }

  select(id: number): void {
    this.activeId = id;
    for (const t of this.tabs) t.view.setVisible(t.id === id);
    this.layout();
    this.emit();
  }

  /** Navigates the active tab. Switching between internal and web pages swaps the view (new session). */
  navigate(url: string): void {
    const tab = this.active();
    if (!tab) return this.open(url);
    if (tab.internal === isWeb(url)) {
      const i = this.tabs.indexOf(tab);
      this.win.contentView.removeChildView(tab.view);
      tab.view.webContents.close();
      const next = { ...this.createTab(url), id: tab.id };
      this.tabs[i] = next;
      this.select(next.id);
    } else {
      void tab.view.webContents.loadURL(url);
    }
  }

  back(): void {
    const h = this.active()?.view.webContents.navigationHistory;
    if (h?.canGoBack()) h.goBack();
  }

  forward(): void {
    const h = this.active()?.view.webContents.navigationHistory;
    if (h?.canGoForward()) h.goForward();
  }

  reload(): void {
    this.active()?.view.webContents.reload();
  }

  state(): ShellState {
    return { tabs: this.tabs.map((t) => this.tabState(t)), activeId: this.activeId };
  }

  activeContents(): Electron.WebContents | undefined {
    return this.active()?.view.webContents;
  }

  private active(): Tab | undefined {
    return this.tabs.find((t) => t.id === this.activeId);
  }

  private createTab(url: string): Tab {
    const internal = !isWeb(url);
    const view = new WebContentsView({
      webPreferences: internal
        ? { preload: preloadPath, sandbox: true, contextIsolation: true, nodeIntegration: false }
        : {
            session: this.webSession,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            javascript: false,
            spellcheck: false,
          },
    });
    const tab: Tab = { id: this.nextId++, view, internal };
    const wc = view.webContents;

    wc.setWindowOpenHandler(({ url: target }) => {
      if (isWeb(target)) this.open(target);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, target) => {
      if (internal ? isWeb(target) : !isWeb(target)) {
        e.preventDefault();
        if (isWeb(target)) this.navigate(target);
      }
    });
    for (const ev of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated'] as const) {
      wc.on(ev as 'did-stop-loading', () => this.emit());
    }

    this.win.contentView.addChildView(view);
    view.setVisible(false);
    void wc.loadURL(url);
    return tab;
  }

  private tabState(t: Tab): TabState {
    const wc = t.view.webContents;
    const url = wc.getURL() || '';
    return {
      id: t.id,
      title: wc.getTitle() || (url === NEW_TAB_URL ? 'New tab' : url),
      url: url === NEW_TAB_URL ? '' : url.replace(/^umwelt:\/\/app\/(\w+)\.html$/, 'umwelt://$1'),
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      internal: t.internal,
    };
  }

  private layout(): void {
    const [width, height] = this.win.getContentSize() as [number, number];
    this.active()?.view.setBounds({ x: 0, y: CHROME_HEIGHT, width, height: Math.max(0, height - CHROME_HEIGHT) });
  }

  private emit(): void {
    if (!this.win.isDestroyed()) this.win.webContents.send('shell:state', this.state());
  }
}
