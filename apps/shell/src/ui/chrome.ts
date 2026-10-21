import type { ShellState } from '../shared/ipc.js';
import { $, api } from './api.js';

const tabsEl = $('tabs');
const newTabBtn = $<HTMLButtonElement>('newtab');
const address = $<HTMLInputElement>('address');
const back = $<HTMLButtonElement>('back');
const forward = $<HTMLButtonElement>('forward');

function render(s: ShellState): void {
  for (const el of [...tabsEl.querySelectorAll('.tab')]) el.remove();
  for (const t of s.tabs) {
    const el = document.createElement('div');
    el.className = `tab${t.id === s.activeId ? ' active' : ''}${t.loading ? ' loading' : ''}`;
    el.title = t.url || t.title;
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = t.title;
    const close = document.createElement('button');
    close.textContent = '×';
    close.title = 'Close tab';
    close.onclick = (e) => {
      e.stopPropagation();
      void api.closeTab(t.id);
    };
    el.append(title, close);
    el.onclick = () => void api.selectTab(t.id);
    el.onauxclick = (e) => e.button === 1 && void api.closeTab(t.id);
    tabsEl.insertBefore(el, newTabBtn);
  }
  const active = s.tabs.find((t) => t.id === s.activeId);
  if (document.activeElement !== address) address.value = active?.url ?? '';
  if (active && !active.url && !active.loading) address.focus();
  back.disabled = !active?.canGoBack;
  forward.disabled = !active?.canGoForward;
}

api.onState(render);
newTabBtn.onclick = () => void api.newTab();
back.onclick = () => void api.back();
forward.onclick = () => void api.forward();
$('reload').onclick = () => void api.reload();
$('settings').onclick = () => void api.openSettings();
address.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && address.value.trim()) {
    void api.navigate(address.value);
    address.blur();
  } else if (e.key === 'Escape') {
    address.blur();
  }
});
address.addEventListener('focus', () => address.select());
