import { BrowserWindow, WebContentsView, type Session } from 'electron';
import type { ShellState, TabState } from './shared/ipc.js';
import { preloadPath } from './paths.js';

export const CHROME_HEIGHT = 76;
/** Label strip above the two panes of a compare tab, drawn by the chrome UI. */
export const COMPARE_STRIP_HEIGHT = 28;
export const NEW_TAB_URL = 'umwelt://app/newtab.html';
export const SETTINGS_URL = 'umwelt://app/settings.html';

const isWeb = (url: string) => /^https?:\/\//i.test(url);

interface Tab {
  id: number;
  view: WebContentsView;
  internal: boolean;
  /** Compare tab: a second pane, same URL, rendered with the comparison profile in its own session. */
  compare?: WebContentsView;
}

export class TabManager {
  private readonly tabs: Tab[] = [];
  private activeId: number | null = null;
  private nextId = 1;

  constructor(
    private readonly win: BrowserWindow,
    private readonly webSession: Session,
    private readonly compareSession: Session,
    /** Shell-wide state the chrome UI shows alongside the tabs (profile names, presets). */
    private readonly extra: () => Omit<ShellState, 'tabs' | 'activeId'>,
  ) {
    win.on('resize', () => this.layout());
  }

  /** Splits the active web tab (or opens `url`) into your profile on the left and the comparison profile on the right. */
  openCompare(url?: string): void {
    const tab = this.active();
    const target = url ?? (tab && !tab.internal ? tab.view.webContents.getURL() : '');
    if (!isWeb(target)) return;
    if (tab && !tab.internal && !tab.compare) {
      tab.compare = this.createCompareView(tab, target);
      this.select(tab.id);
      return;
    }
    const next = this.createTab(target);
    next.compare = this.createCompareView(next, target);
    this.tabs.push(next);
    this.select(next.id);
  }

  closeCompare(): void {
    const tab = this.active();
    if (!tab?.compare) return;
    this.dropCompare(tab);
    this.select(tab.id);
  }

  /** After the comparison profile changes: regenerate every right-hand pane. */
  reloadCompares(): void {
    for (const t of this.tabs) t.compare?.webContents.reload();
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
    this.dropCompare(tab);
    this.win.contentView.removeChildView(tab.view);
    tab.view.webContents.close();
    this.tabs.splice(i, 1);
    if (!this.tabs.length) return this.open(NEW_TAB_URL);
    if (this.activeId === id) this.select((this.tabs[i] ?? this.tabs[i - 1] ?? this.tabs[0])!.id);
    else this.emit();
  }

  select(id: number): void {
    this.activeId = id;
    for (const t of this.tabs) {
      t.view.setVisible(t.id === id);
      t.compare?.setVisible(t.id === id);
    }
    this.layout();
    this.emit();
  }

  /** Navigates the active tab. Switching between internal and web pages swaps the view (new session). */
  navigate(url: string): void {
    const tab = this.active();
    if (!tab) return this.open(url);
    // Internal pages can't be compared: leave split mode.
    if (tab.compare && !isWeb(url)) this.dropCompare(tab);
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
    const tab = this.active();
    tab?.view.webContents.reload();
    tab?.compare?.webContents.reload();
  }

  state(): ShellState {
    return { ...this.extra(), tabs: this.tabs.map((t) => this.tabState(t)), activeId: this.activeId };
  }

  activeContents(): Electron.WebContents | undefined {
    return this.active()?.view.webContents;
  }

  /** Right-hand pane of the active tab, if it is a compare tab. */
  activeCompareContents(): Electron.WebContents | undefined {
    return this.active()?.compare?.webContents;
  }

  private active(): Tab | undefined {
    return this.tabs.find((t) => t.id === this.activeId);
  }

  private webView(session: Session): WebContentsView {
    return new WebContentsView({
      webPreferences: { session, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, spellcheck: false },
    });
  }

  /** The right-hand pane follows the left one: every navigation on the left is repeated on the right. */
  private createCompareView(tab: Tab, url: string): WebContentsView {
    const view = this.webView(this.compareSession);
    const wc = view.webContents;
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    // Links clicked on the right drive the left pane, which then brings the right one along.
    wc.on('will-navigate', (e, target) => {
      e.preventDefault();
      if (isWeb(target)) void tab.view.webContents.loadURL(target);
    });
    for (const ev of ['did-start-loading', 'did-stop-loading', 'page-title-updated'] as const) {
      wc.on(ev as 'did-stop-loading', () => this.emit());
    }
    this.win.contentView.addChildView(view);
    view.setVisible(false);
    void wc.loadURL(url);
    return view;
  }

  private dropCompare(tab: Tab): void {
    if (!tab.compare) return;
    this.win.contentView.removeChildView(tab.compare);
    tab.compare.webContents.close();
    delete tab.compare;
  }

  private createTab(url: string): Tab {
    const internal = !isWeb(url);
    const view = internal
      ? new WebContentsView({ webPreferences: { preload: preloadPath, sandbox: true, contextIsolation: true, nodeIntegration: false } })
      : this.webView(this.webSession);
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
    wc.on('did-navigate', (_e, navigated) => {
      const right = tab.compare?.webContents;
      if (right && right.getURL() !== navigated) void right.loadURL(navigated);
    });

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
      compare: t.compare ? { loading: t.compare.webContents.isLoading() } : null,
    };
  }

  private layout(): void {
    const [width, height] = this.win.getContentSize() as [number, number];
    const tab = this.active();
    if (!tab) return;
    if (!tab.compare) {
      tab.view.setBounds({ x: 0, y: CHROME_HEIGHT, width, height: Math.max(0, height - CHROME_HEIGHT) });
      return;
    }
    const top = CHROME_HEIGHT + COMPARE_STRIP_HEIGHT;
    const half = Math.floor((width - 2) / 2);
    const h = Math.max(0, height - top);
    tab.view.setBounds({ x: 0, y: top, width: half, height: h });
    tab.compare.setBounds({ x: half + 2, y: top, width: width - half - 2, height: h });
  }

  private emit(): void {
    if (!this.win.isDestroyed()) this.win.webContents.send('shell:state', this.state());
  }
}
