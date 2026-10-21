import type { ProfileForm } from '../shared/ipc.js';
import { $, api } from './api.js';

type Axis = keyof ProfileForm['orientation'];
const AXES: Array<[Axis, string, string]> = [
  ['political', 'Left / progressive', 'Right / conservative'],
  ['religious', 'Secular', 'Religious / devout'],
  ['sexual', 'Queer / LGBTQ+', 'Heterosexual / traditional family'],
];

const form = $<HTMLFormElement>('form');
const status = $('status');
const strength = $<HTMLInputElement>('strength');
const text = (id: string) => $<HTMLInputElement>(id);

function axisRow(axis: Axis, neg: string, pos: string, value: number | null): HTMLElement {
  const row = document.createElement('div');
  row.className = 'axis';
  const on = document.createElement('input');
  on.type = 'checkbox';
  on.id = `${axis}-on`;
  on.checked = value !== null;
  on.title = `Apply ${axis} axis`;
  const range = document.createElement('input');
  range.type = 'range';
  range.id = `${axis}-value`;
  Object.assign(range, { min: '-1', max: '1', step: '0.1', value: String(value ?? 0) });
  range.disabled = value === null;
  on.onchange = () => (range.disabled = !on.checked);
  const poles = document.createElement('div');
  poles.className = 'poles';
  poles.innerHTML = '<span></span><span></span>';
  poles.children[0]!.textContent = neg;
  poles.children[1]!.textContent = pos;
  row.append(on, range, poles);
  return row;
}

const showStrength = () => ($('strengthValue').textContent = `${strength.value}%`);

const p = await api.getProfile();
let id = p.id;
text('name').value = p.name;
text('tone').value = p.tone;
$<HTMLSelectElement>('readingLevel').value = p.readingLevel;
text('language').value = p.language;
text('interests').value = p.interests.join(', ');
$('axes').append(...AXES.map(([a, neg, pos]) => axisRow(a, neg, pos, p.orientation[a])));
strength.value = String(Math.round(p.strength * 100));
showStrength();
strength.oninput = showStrength;

form.onsubmit = async (e) => {
  e.preventDefault();
  const axis = (a: Axis) => (text(`${a}-on`).checked ? Number(text(`${a}-value`).value) : null);
  const next: ProfileForm = {
    id,
    name: text('name').value.trim(),
    tone: text('tone').value.trim() || 'neutral',
    readingLevel: $<HTMLSelectElement>('readingLevel').value as ProfileForm['readingLevel'],
    language: text('language').value.trim() || 'en',
    interests: text('interests').value.split(',').map((s) => s.trim()).filter(Boolean),
    orientation: { political: axis('political'), religious: axis('religious'), sexual: axis('sexual') },
    strength: Number(strength.value) / 100,
  };
  const r = await api.saveProfile(next);
  status.textContent = r.ok ? 'Saved. New pages use this profile.' : `Not saved: ${r.error}`;
  if (r.ok) id = next.id;
};
