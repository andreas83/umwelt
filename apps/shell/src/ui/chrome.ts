import type { ShellState } from '../shared/ipc.js';
import { $, api } from './api.js';

const tabsEl = $('tabs');
const newTabBtn = $<HTMLButtonElement>('newtab');
const address = $<HTMLInputElement>('address');
const back = $<HTMLButtonElement>('back');
const forward = $<HTMLButtonElement>('forward');
const compareBtn = $<HTMLButtonElement>('compare');
const strip = $('compare-strip');
const presetSelect = $<HTMLSelectElement>('preset');

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

  // Compare: available on web pages; the strip labels the two panes.
  compareBtn.disabled = !active || active.internal;
  compareBtn.classList.toggle('on', !!active?.compare);
  strip.hidden = !active?.compare;
  $('left-name').textContent = s.profileName;
  if (presetSelect.options.length !== s.presets.length) {
    presetSelect.replaceChildren(...s.presets.map((p) => new Option(p.name, p.id)));
  }
  presetSelect.value = s.comparePresetId;
  $('left-loading').hidden = !active?.loading;
  $('right-loading').hidden = !active?.compare?.loading;
}

api.onState(render);
newTabBtn.onclick = () => void api.newTab();
back.onclick = () => void api.back();
forward.onclick = () => void api.forward();
$('reload').onclick = () => void api.reload();
$('settings').onclick = () => void api.openSettings();
compareBtn.onclick = () => void (compareBtn.classList.contains('on') ? api.closeCompare() : api.openCompare());
$('close-compare').onclick = () => void api.closeCompare();
presetSelect.onchange = () => void api.setComparePreset(presetSelect.value);
address.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && address.value.trim()) {
    void api.navigate(address.value);
    address.blur();
  } else if (e.key === 'Escape') {
    address.blur();
  }
});
address.addEventListener('focus', () => address.select());
