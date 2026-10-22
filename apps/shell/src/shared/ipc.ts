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
  /** Present when the tab is split into your profile (left) and the comparison profile (right). */
  compare: { loading: boolean } | null;
}

export interface PresetSummary {
  id: string;
  name: string;
}

export interface ShellState {
  tabs: TabState[];
  activeId: number | null;
  /** Name of your own profile (left pane). */
  profileName: string;
  /** Preset used for the right pane of compare tabs. */
  comparePresetId: string;
  presets: PresetSummary[];
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
  /** New world seed: every page is generated afresh from now on. */
  refreshWorld(): Promise<void>;
  getSourceMode(): Promise<SourceMode>;
  openCompare(): Promise<void>;
  closeCompare(): Promise<void>;
  setComparePreset(id: string): Promise<void>;
  /** Full preset profiles, to start the profile form from. */
  getPresets(): Promise<ProfileForm[]>;
  /** Takes effect after a restart. */
  setSourceMode(mode: SourceMode): Promise<void>;
}

export type SourceMode = 'A' | 'B';

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
  refreshWorld: 'world:refresh',
  getSourceMode: 'mode:get',
  openCompare: 'compare:open',
  closeCompare: 'compare:close',
  setComparePreset: 'compare:preset',
  getPresets: 'presets:get',
  setSourceMode: 'mode:set',
} as const;
