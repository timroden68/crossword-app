// The solving screen: grid, clues, typing, Word Bank, check/reveal, timer, finishing.
import { $, $$, isTouch, isNarrow, escapeHTML, openSheet, closeSheet, sheetOpen, toast, fmtTime, fmtLong } from './ui.js';
import { store } from './store.js';
import { settings, saveSettings, settingsHTML, bindSettings } from './settings.js';
import { buildKeyboard } from './keyboard.js';
import { themeIcon } from './themeicons.js';

const DIRS = ['across', 'down'];
const enterHint = isTouch ? '' : ' <span class="kbd">↵</span>';  // Enter presses a sheet's main button (see ui.js)
let P = null, S = null, timerId = null, cellEls = [], kbHidden = false;
let hooks = { onExit() {}, onSolved() {} };

export const currentPuzzle = () => P;

/* ---------- saved progress ---------- */
// Progress is stored by the puzzle's grid fingerprint, not its number, so it follows a puzzle
// when the book reorders puzzles. A puzzle whose grid changes starts fresh.
export const progressKey = p => 'prog:' + p.sig;

function newState(p) {
  const n = p.rows * p.cols;
  const s = { sig: p.sig, letters: Array(n).fill(''), pencil: Array(n).fill(false), mark: Array(n).fill(''),
    elapsed: 0, done: false, helped: false, cur: null, dir: 'across', pct: 0 };
  p.given.forEach(i => { s.letters[i] = p.cells[i].sol; s.mark[i] = 'given'; });
  return s;
}
function save() { if (P && S) store.set(progressKey(P), S); }

/* ---------- opening a puzzle ---------- */
const other = d => (d === 'across' ? 'down' : 'across');
const curEntry = () => P.entries[S.dir][P.cells[S.cur][S.dir]];

export function openPuzzle(p) {
  P = p;
  S = store.get(progressKey(p));
  let fresh = !S;
  if (S && (S.sig !== p.sig || !Array.isArray(S.letters) || S.letters.length !== p.rows * p.cols)) S = null;
  if (!S) { S = newState(p); fresh = true; }
  if (S.cur == null || !P.cells[S.cur] || P.cells[S.cur].block) S.cur = (P.all.find(e => e.cells.some(i => !S.letters[i])) || P.all[0]).cells[0];
  if (P.cells[S.cur][S.dir] == null) S.dir = other(S.dir);
  S.paused = false;

  $('#pzTitle').textContent = `${P.number}. ${P.title}`;
  $('#pzMeta').textContent = `${P.multiLevel ? `Level ${P.q.level} · ` : ''}${P.levelName} · ${P.cols}×${P.rows}`;
  $('#solver').classList.remove('show-lists');
  $('#solver').classList.toggle('noclues', !P.show.clues);
  renderHunt();
  buildGrid();
  buildClueLists();
  layout();
  render();
  startTimer();
  if (fresh && P.tips.length) showTips();
}

export function closePuzzle() {
  stopTimer(); save(); closeMenus();
  P = null; S = null;
}

function renderHunt() {
  const h = $('#huntNote');
  let html;
  if (P.show.hunt === 'hidden')
    html = S && S.done ? `The hidden theme was <b>${escapeHTML(P.themeName)}</b>.` : 'Some answers share a hidden theme. Can you work out what it is?';
  else html = escapeHTML(P.q.hunt) + (P.show.icons ? ` Look for ${themeIcon(P.theme)}` : '');
  h.innerHTML = html;
  h.hidden = !html;
}

function showTips() {
  openSheet(`Puzzle ${P.number}`, `<div class="tips">${P.tips.map(t => `<p>${escapeHTML(t)}</p>`).join('')}</div>
    <div class="btn-row" style="justify-content:center"><button class="pill-btn primary" data-close data-default>Let’s go${enterHint}</button></div>`);
  $('#sheetBody [data-close]').onclick = closeSheet;
}

/* ---------- grid ---------- */
function buildGrid() {
  const g = $('#grid');
  g.style.setProperty('--cols', P.cols);
  g.innerHTML = '';
  const blk = (r, c) => r >= 0 && c >= 0 && r < P.rows && c < P.cols && P.cells[r * P.cols + c].block;
  cellEls = P.cells.map((c, i) => {
    const el = document.createElement('div');
    const r = Math.floor(i / P.cols), col = i % P.cols;
    if (c.block) {
      el.className = 'cell block' + (blk(r, col + 1) ? ' jr' : '') + (blk(r + 1, col) ? ' jd' : '') + (blk(r, col - 1) ? ' jl' : '') + (blk(r - 1, col) ? ' ju' : '');
    } else {
      const circled = P.circles.has(i);
      el.className = 'cell' + (circled ? ' circle' : '');
      el.innerHTML = (circled ? '<span class="circ"></span>' : '') + (c.num ? `<span class="num">${escapeHTML(c.num)}</span>` : '') + '<span class="let"></span>';
      el.dataset.i = i;
    }
    g.appendChild(el);
    return el;
  });
}

$('#grid').addEventListener('pointerdown', ev => {
  const el = ev.target.closest('.cell');
  if (!P || !el || el.dataset.i == null || S.paused) return;
  ev.preventDefault();
  const i = +el.dataset.i;
  if (i === S.cur) S.dir = other(S.dir);
  else S.cur = i;
  if (P.cells[S.cur][S.dir] == null) S.dir = other(S.dir);
  if (kbHidden) setKeyboardHidden(false);
  render(); save();
});

/* ---------- clues ---------- */
function clueHTML(e) {
  const icon = P.show.icons && P.themeWords.has(e.answer) ? ' ' + themeIcon(P.theme) : '';
  if (!P.show.clues) return `<span class="noclue">${e.cells.length} letters</span>${icon}`;
  if (!e.clue) return '<span class="noclue">No clue yet</span>';
  return escapeHTML(e.clue).replace(/&lt;(\/?)(i|em|b|strong)&gt;/g, '<$1$2>') + icon;
}

function buildClueLists() {
  DIRS.forEach(d => {
    const ol = $('#' + d + 'List');
    ol.innerHTML = '';
    P.entries[d].forEach((e, k) => {
      const li = document.createElement('li');
      li.dataset.dir = d; li.dataset.k = k;
      li.innerHTML = `<b>${escapeHTML(e.num)}</b><span>${clueHTML(e)}</span>`;
      ol.appendChild(li);
    });
  });
}

$('#solve').addEventListener('click', ev => {
  const li = ev.target.closest('li[data-dir]');
  if (!P || !li) return;
  gotoEntry(P.entries[li.dataset.dir][+li.dataset.k]);
  if ($('#solver').classList.contains('show-lists')) { $('#solver').classList.remove('show-lists'); layout(); render(); }
});

function gotoEntry(e) {
  S.dir = e.dir;
  S.cur = e.cells.find(i => !S.letters[i]) ?? e.cells[0];
  render(); save();
}

function renderBank() {
  const bank = $('#bank');
  bank.hidden = !P.show.bank;
  if (!P.show.bank) return;
  const solved = new Set(P.all.filter(e => e.cells.every(i => S.letters[i] === P.cells[i].sol)).map(e => e.answer));
  const words = P.all.map(e => e.answer).sort((a, b) => a.length - b.length || a.localeCompare(b));
  $('#bankWords').innerHTML = words.map(w => `<span class="${solved.has(w) ? 'used' : ''}">${escapeHTML(w)}${P.show.icons && P.themeWords.has(w) ? themeIcon(P.theme) : ''}</span>`).join('');
}

/* ---------- drawing ---------- */
function render() {
  if (!P) return;
  const e = curEntry();
  const inWord = new Set(e.cells);
  const linked = new Set(settings.linked ? e.refs.flatMap(r => r.cells) : []);
  P.cells.forEach((c, i) => {
    if (c.block) return;
    const el = cellEls[i], cl = el.classList;
    cl.toggle('cursor', i === S.cur);
    cl.toggle('word', inWord.has(i) && i !== S.cur);
    cl.toggle('linked', linked.has(i) && !inWord.has(i));
    cl.toggle('pencil', !!S.pencil[i]);
    cl.toggle('wrong', S.mark[i] === 'wrong');
    cl.toggle('revealed', S.mark[i] === 'revealed');
    cl.toggle('given', S.mark[i] === 'given');
    cl.toggle('theme', S.done && P.themeCells.has(i) && i !== S.cur && !inWord.has(i));
    el.lastChild.textContent = S.letters[i];
  });
  $$('#solve li[data-dir]').forEach(li => {
    const ent = P.entries[li.dataset.dir][+li.dataset.k];
    li.classList.toggle('active', ent === e);
    li.classList.toggle('linked', settings.linked && e.refs.includes(ent));
    li.classList.toggle('done', ent.cells.every(i => S.letters[i]));
  });
  if (!isNarrow()) $$('#solve li.active').forEach(scrollListTo);
  else if (!$('#solver').classList.contains('show-lists')) cellEls[S.cur].scrollIntoView({ block: 'nearest' });
  const prompt = P.show.clues ? clueHTML(e) : `<span class="noclue">${e.cells.length} letters: find it in the Word Bank</span>`;
  $('#clueBarText').innerHTML = `<b>${escapeHTML(e.num)}</b><span class="arrow">${e.dir === 'across' ? '▶' : '▼'}</span>${prompt}`;
  $('#autocheckItem').classList.toggle('on', settings.autocheck);
  $('#pencilItem').classList.toggle('on', !!S.pencilMode);
  $('#tipsItem').hidden = !P.tips.length;
  renderBank();
  renderBadge();
}

function scrollListTo(li) {
  const ol = li.parentElement;
  const top = li.offsetTop - ol.offsetTop, bottom = top + li.offsetHeight;
  if (top < ol.scrollTop || bottom > ol.scrollTop + ol.clientHeight) ol.scrollTo({ top: top - 8, behavior: 'smooth' });
}

function renderBadge() {
  const b = $('#solvedBadge');
  b.hidden = !S.done;
  if (S.done) b.innerHTML = `Solved in <b>${fmtLong(S.elapsed)}</b>`;
  const t = $('#timer');
  t.textContent = settings.showTimer || S.done ? fmtTime(S.elapsed) : '';
  t.hidden = !t.textContent;
}

/* Size the grid to the space available. */
export function layout() {
  if (!P || $('#solver').hidden) return;
  const wrap = $('#gridWrap');
  let pitch;
  if (isNarrow()) {
    // Fit the whole grid on screen when the squares stay a comfortable size; otherwise fill the width and scroll (phones)
    const byWidth = Math.min((wrap.clientWidth - 2) / P.cols, 72), byHeight = (wrap.clientHeight - 2) / P.rows;
    pitch = byHeight >= 30 ? Math.min(byWidth, byHeight) : byWidth;
  } else pitch = Math.min((wrap.clientWidth - 2) / P.cols, (wrap.clientHeight - 2) / P.rows, 76);
  const gap = Math.max(2, Math.round(pitch * 0.06));
  const cell = Math.max(14, Math.floor(pitch - gap + gap / P.cols));
  document.documentElement.style.setProperty('--cell', cell + 'px');
  document.documentElement.style.setProperty('--gap', gap + 'px');
}
addEventListener('resize', () => requestAnimationFrame(() => { layout(); render(); }));

/* ---------- typing ---------- */
const isLocked = i => S.mark[i] === 'revealed' || S.mark[i] === 'given' || S.done;

function typeLetter(ch) {
  if (!P || S.done || S.paused) return;
  const i = S.cur;
  const e = curEntry();
  const wasOpen = e.cells.some(j => !S.letters[j]);
  if (!isLocked(i)) {
    S.letters[i] = ch;
    S.pencil[i] = !!S.pencilMode;
    S.mark[i] = settings.autocheck && ch !== P.cells[i].sol ? 'wrong' : '';
  }
  advance(i, wasOpen && e.cells.every(j => S.letters[j]));
  afterChange();
}

// completed: this letter filled the word's last empty square (wherever it is in the word)
function advance(i, completed) {
  const e = curEntry(), pos = e.cells.indexOf(i), last = pos === e.cells.length - 1;
  const empty = j => !S.letters[j];
  if (settings.endOfWord === 'next' && (completed || (last && !settings.skipFilled))) { nextClue(1, settings.skipFilled); return; }
  if (settings.skipFilled) {
    const t = e.cells.slice(pos + 1).find(empty) ?? e.cells.slice(0, pos).find(empty);
    if (t != null) { S.cur = t; return; }
  }
  if (!last) S.cur = e.cells[pos + 1];
}

function backspace() {
  if (!P || S.done || S.paused) return;
  const e = curEntry(), pos = e.cells.indexOf(S.cur);
  if (S.letters[S.cur] && !isLocked(S.cur)) clearCell(S.cur);
  else if (pos > 0) { S.cur = e.cells[pos - 1]; if (!isLocked(S.cur)) clearCell(S.cur); }
  afterChange();
}
function clearCell(i) { S.letters[i] = ''; S.pencil[i] = false; if (S.mark[i] === 'wrong') S.mark[i] = ''; }

function move(dr, dc) {
  const want = dr ? 'down' : 'across';
  if (S.dir !== want && P.cells[S.cur][want] != null) { S.dir = want; render(); return; }
  let r = Math.floor(S.cur / P.cols), c = S.cur % P.cols;
  for (;;) {
    r += dr; c += dc;
    if (r < 0 || c < 0 || r >= P.rows || c >= P.cols) return;
    if (!P.cells[r * P.cols + c].block) break;
  }
  S.cur = r * P.cols + c;
  if (P.cells[S.cur][S.dir] == null) S.dir = other(S.dir);
  render(); save();
}

function nextClue(step, skipFilled = settings.skipFilled) {
  const all = P.all;
  const start = all.indexOf(curEntry());
  for (let t = 1; t <= all.length; t++) {
    const k = (start + step * t + all.length * t) % all.length;
    if (!skipFilled || all[k].cells.some(i => !S.letters[i])) { gotoEntry(all[k]); return; }
  }
  gotoEntry(all[(start + step + all.length) % all.length]);
}

function toggleDir() {
  if (P.cells[S.cur][other(S.dir)] != null) { S.dir = other(S.dir); render(); save(); }
}

document.addEventListener('keydown', ev => {
  if (!P || $('#solver').hidden) return;
  if (sheetOpen()) { if (ev.key === 'Escape') closeSheet(); return; }
  if (ev.metaKey || ev.ctrlKey || ev.altKey || S.paused) return;
  const k = ev.key;
  if (/^[a-zA-Z]$/.test(k)) typeLetter(k.toUpperCase());
  else if (k === 'Backspace') backspace();
  else if (k === 'Delete') { if (!isLocked(S.cur)) clearCell(S.cur); afterChange(); }
  else if (k === 'ArrowLeft') move(0, -1);
  else if (k === 'ArrowRight') move(0, 1);
  else if (k === 'ArrowUp') move(-1, 0);
  else if (k === 'ArrowDown') move(1, 0);
  else if (k === ' ') toggleDir();
  else if (k === 'Tab' || k === 'Enter') nextClue(ev.shiftKey ? -1 : 1);
  else if (k === 'Escape') closeMenus();
  else return;
  ev.preventDefault();
});

/* ---------- keyboard + clue bar ---------- */
function setKeyboardHidden(h) {
  kbHidden = h;
  $('#keyboard').hidden = h || !isTouch;
  requestAnimationFrame(layout);
}
if (isTouch) {
  buildKeyboard($('#keyboard'), k => (k === 'back' ? backspace() : k === 'dir' ? toggleDir() : typeLetter(k)));
  $('#keyboard').hidden = false;
}
$('#kbToggle').addEventListener('click', () => { if (isTouch) setKeyboardHidden(!kbHidden); });
$('#prevClue').addEventListener('click', () => nextClue(-1, false));
$('#nextClue').addEventListener('click', () => nextClue(1, false));
$('#clueBarText').addEventListener('click', () => P && toggleDir());
$('#listBtn').addEventListener('click', () => {
  $('#solver').classList.toggle('show-lists');
  layout(); render();
  if ($('#solver').classList.contains('show-lists')) { const a = $('#solve li.active'); a && a.scrollIntoView({ block: 'center' }); }
});

/* ---------- menus ---------- */
function scope(kind) {
  if (kind === 'cell') return [S.cur];
  if (kind === 'word') return curEntry().cells;
  return P.cells.map((c, i) => (c.block ? -1 : i)).filter(i => i >= 0);
}

function doAction(action) {
  const [verb, kind] = action.split('-');
  if (action === 'settings') {
    const body = openSheet('Crossword Settings', settingsHTML());
    bindSettings(body, k => (k === 'autocheck' ? applyAutocheck() : render()));
    return;
  }
  if (action === 'tips') return showTips();
  if (action === 'toggle-pencil') { S.pencilMode = !S.pencilMode; render(); return; }
  if (action === 'toggle-autocheck') { settings.autocheck = !settings.autocheck; saveSettings(); applyAutocheck(); return; }
  if (verb === 'clear') {
    if (!confirm('Clear all your answers and reset the timer?')) return;
    S = Object.assign(newState(P), { cur: S.cur, dir: S.dir });
    renderHunt(); render(); save(); startTimer(); return;
  }
  if (S.done) return;
  if (verb === 'reveal' && kind === 'puzzle' && !confirm('Reveal the whole puzzle?')) return;
  let wrong = 0;
  scope(kind).forEach(i => {
    if (S.mark[i] === 'given' || S.mark[i] === 'revealed') return;
    const right = S.letters[i] === P.cells[i].sol;
    if (verb === 'check') { if (S.letters[i] && !right) { S.mark[i] = 'wrong'; wrong++; } }
    else if (!right) { S.letters[i] = P.cells[i].sol; S.pencil[i] = false; S.mark[i] = 'revealed'; S.helped = true; }
    else S.pencil[i] = false;
  });
  if (verb === 'check') toast(wrong ? `${wrong} incorrect square${wrong > 1 ? 's' : ''}` : 'No mistakes so far');
  afterChange();
}

function applyAutocheck() {
  if (!P) return;
  P.cells.forEach((c, i) => {
    if (c.block || S.mark[i] === 'given' || S.mark[i] === 'revealed') return;
    if (settings.autocheck && S.letters[i] && S.letters[i] !== c.sol) S.mark[i] = 'wrong';
    else if (!settings.autocheck && S.mark[i] === 'wrong') S.mark[i] = '';
  });
  render(); save();
}

$$('#solver [data-action]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); closeMenus(); doAction(b.dataset.action); }));
$$('[data-menu]').forEach(b => b.addEventListener('click', ev => {
  ev.stopPropagation();
  const pop = $('#menu-' + b.dataset.menu), was = pop.hidden;
  closeMenus(); pop.hidden = !was;
}));
function closeMenus() { $$('.menu-pop').forEach(m => (m.hidden = true)); }
document.addEventListener('click', ev => { if (!ev.target.closest('.menu')) closeMenus(); });

/* ---------- finishing ---------- */
function afterChange() {
  const white = P.cells.filter(c => !c.block).length;
  const filled = P.cells.filter((c, i) => !c.block && S.letters[i]).length;
  S.pct = filled / white;
  if (filled === white && !S.done) {
    if (P.cells.every((c, i) => c.block || S.letters[i] === c.sol)) finishPuzzle();
    else if (!S.toldWrong) { S.toldWrong = true; toast('Almost! Something isn’t quite right.'); }
  }
  if (filled < white) S.toldWrong = false;
  render(); save();
}

function finishPuzzle() {
  S.done = true; stopTimer();
  P.cells.forEach((c, i) => { if (S.mark[i] === 'wrong') S.mark[i] = ''; });
  renderHunt();
  const words = [...P.themeWords].join(' · ');
  const theme = P.themeWords.size ? `<p>The hidden ${escapeHTML(P.themeName)}:<br><b>${escapeHTML(words)}</b></p>` : '';
  const cert = P.certificate ? `<div class="cert-mini">🏆 You earned the <b>${escapeHTML(P.certificate.title)}</b> certificate!</div>` : '';
  const html = `<div class="solved-body"><div class="big">🎉</div>
    <p>You finished <b>${escapeHTML(P.title)}</b> in <b>${fmtLong(S.elapsed)}</b>${S.helped ? ' (with a little help)' : ''}.</p>${theme}${cert}
    <div class="btn-row" style="justify-content:center">
      <button class="pill-btn" data-k="stay">Keep looking</button>
      <button class="pill-btn primary" data-k="next" data-default>Next puzzle${enterHint}</button></div></div>`;
  setTimeout(() => {
    openSheet('Solved!', html);
    $('#sheetBody [data-k=stay]').onclick = closeSheet;
    $('#sheetBody [data-k=next]').onclick = () => { closeSheet(); hooks.onNext(P.number); };
  }, 250);
  hooks.onSolved(P);
}

/* ---------- timer ---------- */
function startTimer() {
  stopTimer();
  S.paused = false; $('#pausedOverlay').hidden = true;
  renderBadge();
  if (S.done) return;
  timerId = setInterval(() => {
    if (document.hidden || !S) return;
    S.elapsed++; renderBadge();
    if (S.elapsed % 5 === 0) save();
  }, 1000);
}
function stopTimer() { clearInterval(timerId); timerId = null; }
$('#timerBtn').addEventListener('click', () => {
  if (!P || S.done || S.paused) return;
  stopTimer(); S.paused = true; save();
  $('#pausedOverlay').hidden = false;
  $('#pausedOverlay p').textContent = `Paused · ${fmtTime(S.elapsed)}`;
});
$('#resumeBtn').addEventListener('click', startTimer);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

export function initSolver(h) { hooks = Object.assign(hooks, h); }
