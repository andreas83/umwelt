// Sandboxed preloads must be CommonJS. Loaded only into internal pages (chrome, settings), never into web tabs.
import electron = require('electron');
import type { ShellState, UmweltApi } from './shared/ipc.js';

const { contextBridge, ipcRenderer } = electron;

// Mirrors IPC in shared/ipc.ts (a CJS preload cannot import the ESM module at runtime).
const api: UmweltApi = {
  newTab: (url) => ipcRenderer.invoke('tab:new', url),
  closeTab: (id) => ipcRenderer.invoke('tab:close', id),
  selectTab: (id) => ipcRenderer.invoke('tab:select', id),
  navigate: (input) => ipcRenderer.invoke('tab:navigate', input),
  back: () => ipcRenderer.invoke('tab:back'),
  forward: () => ipcRenderer.invoke('tab:forward'),
  reload: () => ipcRenderer.invoke('tab:reload'),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  onState: (cb) => void ipcRenderer.on('shell:state', (_e, s: ShellState) => cb(s)),
  getProfile: () => ipcRenderer.invoke('profile:get'),
  saveProfile: (p) => ipcRenderer.invoke('profile:save', p),
  refreshWorld: () => ipcRenderer.invoke('world:refresh'),
  getSourceMode: () => ipcRenderer.invoke('mode:get'),
  openCompare: () => ipcRenderer.invoke('compare:open'),
  closeCompare: () => ipcRenderer.invoke('compare:close'),
  setComparePreset: (id) => ipcRenderer.invoke('compare:preset', id),
  getPresets: () => ipcRenderer.invoke('presets:get'),
  setSourceMode: (mode) => ipcRenderer.invoke('mode:set', mode),
};

contextBridge.exposeInMainWorld('umwelt', api);
