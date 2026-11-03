// Shared bits of UI: $, sheets, toasts, formatting.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
export const isTouch = matchMedia('(pointer: coarse)').matches;
// Narrow layout (grid, clue bar, keyboard; clue lists on demand): small windows, and any touch screen held upright.
export const isNarrow = () => innerWidth < 900 || (isTouch && innerHeight > innerWidth);
function applyLayoutClass() {
  document.documentElement.classList.toggle('narrow', isNarrow());
  document.documentElement.classList.toggle('touch-wide', isTouch && !isNarrow());
}
applyLayoutClass();
addEventListener('resize', applyLayoutClass);

export const escapeHTML = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

let onSheetClose = null;
export function openSheet(title, html, onClose = null) {
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = html;
  $('#sheet').hidden = false;
  onSheetClose = onClose;
  return $('#sheetBody');
}
export function closeSheet() {
  if ($('#sheet').hidden) return;
  $('#sheet').hidden = true;
  $('#sheetBody').innerHTML = '';
  const f = onSheetClose; onSheetClose = null;
  f && f();
}
export const sheetOpen = () => !$('#sheet').hidden;
$('#sheetClose').addEventListener('click', closeSheet);
// Enter presses the sheet's main button (marked data-default), e.g. "Next puzzle"
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Enter' || $('#sheet').hidden || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.target.closest && ev.target.closest('input, select, textarea, button')) return;
  const b = $('#sheetBody [data-default]');
  if (!b) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  b.click();
}, true);
$('#sheet').addEventListener('click', ev => { if (ev.target.id === 'sheet') closeSheet(); });

let toastTimer;
export function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

export function fmtTime(sec) {
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
export function fmtLong(sec) {
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return (h ? h + 'h ' : '') + (h || m ? m + 'm ' : '') + s + 's';
}
