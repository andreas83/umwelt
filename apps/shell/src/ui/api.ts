import type { UmweltApi } from '../shared/ipc.js';

declare global {
  interface Window {
    umwelt: UmweltApi;
  }
}

export const api = window.umwelt;

export function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
}
