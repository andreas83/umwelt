// Shared between main, preload and UI. Types only.

export interface TabState {
  id: number;
  title: string;
  url: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Internal pages (settings, new tab) vs generated web pages. */
  internal: boolean;
}

export interface ShellState {
  tabs: TabState[];
  activeId: number | null;
}

export interface ProfileForm {
  id: string;
  name: string;
  tone: string;
  readingLevel: 'simple' | 'standard' | 'expert';
  language: string;
  interests: string[];
  orientation: { political: number | null; religious: number | null; sexual: number | null };
  strength: number;
}

export interface UmweltApi {
  newTab(url?: string): Promise<void>;
  closeTab(id: number): Promise<void>;
  selectTab(id: number): Promise<void>;
  navigate(input: string): Promise<void>;
  back(): Promise<void>;
  forward(): Promise<void>;
  reload(): Promise<void>;
  openSettings(): Promise<void>;
  onState(cb: (s: ShellState) => void): void;
  getProfile(): Promise<ProfileForm>;
  saveProfile(p: ProfileForm): Promise<{ ok: true } | { ok: false; error: string }>;
}

export const IPC = {
  newTab: 'tab:new',
  closeTab: 'tab:close',
  selectTab: 'tab:select',
  navigate: 'tab:navigate',
  back: 'tab:back',
  forward: 'tab:forward',
  reload: 'tab:reload',
  openSettings: 'settings:open',
  state: 'shell:state',
  getProfile: 'profile:get',
  saveProfile: 'profile:save',
} as const;
