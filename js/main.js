// App start-up, the library screen (free samples + books), unlocking a book, and routing.
import { $, $$, escapeHTML, openSheet, closeSheet, toast } from './ui.js';
import { store } from './store.js';
import { settingsHTML, bindSettings } from './settings.js';
import { loadLibrary, openBook, getLocks, unlock, forgetKey, forgetAllKeys, buildPuzzle } from './book.js';
import { initSolver, openPuzzle, closePuzzle, currentPuzzle, progressKey, layout } from './solver.js';

// A "collection" is the free samples or one book: { slug, title, subtitle, data, puzzles, meta, samples, error }
let COLS = [];
let filter = 'all';
const OPEN_KEY = 'library.open';   // { 'book:<slug>': bool, 'lv:<slug>:<level>': bool }

// A book's name in the app: its title plus its edition when it has one (two editions share one title)
const nameOf = b => b.edition ? `${b.title}: ${b.edition}` : b.title;

function makeCol(slug, title, subtitle, data, meta = null) {
  return { slug, title, subtitle, data, meta, samples: !meta, error: '',
           puzzles: data ? data.puzzles.map(q => buildPuzzle(q, data, slug)) : [] };
}
const colBySlug = slug => COLS.find(c => c.slug === slug);
const isLocked = c => !c.samples && !c.data;
const isHidden = c => isLocked(c) && c.meta && c.meta.hidden;   // hidden collections appear only once unlocked
const href = p => `#/p/${p.slug}/${p.number}`;

/* ---------- progress ---------- */
function progressOf(p) {
  const s = store.get(progressKey(p));
  if (!s || s.sig !== p.sig) return { kind: 'new', label: '' };
  if (s.done) return { kind: 'solved', label: 'Solved', s };
  if (!s.pct || s.pct <= 0) return { kind: 'new', label: '', s };
  return { kind: 'progress', label: Math.round(s.pct * 100) + '%', s };
}
const isSolved = p => progressOf(p).kind === 'solved';
const certEarned = (col, c) => col.puzzles.filter(p => p.number <= c.after).every(isSolved);

/* ---------- library screen ---------- */
function helperText(p) {
  const h = [];
  if (p.show.bank) h.push('Word Bank');
  if (!p.show.clues) h.push('no clues');
  if (p.given.size) h.push('starter letters');
  if (p.show.hunt === 'hidden') h.push('hidden theme');
  return h.join(', ');
}

// The website link in the header goes to the page of the reader's edition. The site's book pages open the app
// with ?edition=uk / ?edition=us (a link from another site only passes the domain, not the page, so the app
// can't tell otherwise); that choice is remembered. Without it: the edition whose book is unlocked here (when
// only one is), else the remembered choice, else the device language (en-GB / en-IE -> UK).
const SITE = { us: 'https://crosswordadventures.com/', uk: 'https://crosswordadventures.com/adventuresone-uk/' };
const EDITION_SLUG = { us: 'adventuresone', uk: 'adventuresone-uk' };
let editionFromLink = null;
{
  const q = new URLSearchParams(location.search), e = (q.get('edition') || '').toLowerCase();
  if (e in SITE) { editionFromLink = e; store.set('siteEdition', e); }
  if (q.has('edition')) { q.delete('edition'); const s = q.toString(); history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash); }
}
function siteEdition() {
  if (editionFromLink) return editionFromLink;
  const open = Object.keys(EDITION_SLUG).filter(e => { const c = COLS.find(x => x.slug === EDITION_SLUG[e]); return c && c.data; });
  if (open.length === 1) return open[0];
  const saved = store.get('siteEdition');
  if (saved in SITE) return saved;
  return (navigator.languages || [navigator.language]).some(l => /^en-(GB|IE)$/i.test(l || '')) ? 'uk' : 'us';
}
function updateSiteLink() { const a = $('#siteLink'); if (a) a.href = SITE[siteEdition()]; }

function renderHome() {
  updateSiteLink();
  const main = $('#homeMain');
  main.innerHTML = '';

  // Up next: in the first unlocked book (or the samples), the first puzzle in progress, else the first unsolved one
  const upCol = COLS.find(c => !c.samples && c.data) || COLS.find(c => c.samples);
  if (upCol) {
    const prog = upCol.puzzles.map(p => [p, progressOf(p)]);
    const next = (prog.find(([, pr]) => pr.kind === 'progress') || prog.find(([, pr]) => pr.kind !== 'solved') || [])[0];
    if (next) {
      const pr = progressOf(next), solved = prog.filter(([, x]) => x.kind === 'solved').length;
      main.insertAdjacentHTML('beforeend', `<a class="upnext" href="${href(next)}">
        <canvas width="120" height="120"></canvas>
        <div><div class="un-label">${pr.kind === 'progress' ? 'Continue' : 'Up next'}</div>
        <div class="un-title">${next.number}. ${escapeHTML(next.title)}</div>
        <div class="un-meta">${escapeHTML(upCol.title)} · ${solved} of ${upCol.puzzles.length} solved</div></div></a>`);
      drawThumb($('.upnext canvas', main), next, pr.s);
    }
  }

  // Each book is a folder, and each level inside it is a folder. What the user opens or closes is remembered;
  // by default the book with "Up next" is open at the level of its next puzzle. A filter opens everything it matches.
  const opened = store.get(OPEN_KEY, {});
  const anyUnlocked = COLS.some(c => !c.samples && c.data);
  const filtering = filter !== 'all';
  const isOpen = (key, dflt) => filtering || (key in opened ? opened[key] : dflt);

  COLS.forEach(col => {
    if (isHidden(col)) return;
    const solvedAll = col.data ? col.puzzles.filter(isSolved).length : 0;
    const book = document.createElement('details');
    book.className = 'book-folder';
    book.dataset.key = `book:${col.slug}`;
    book.open = isOpen(book.dataset.key, col === upCol || (isLocked(col) && !anyUnlocked));
    book.innerHTML = `<summary class="book-head"><span class="chev" aria-hidden="true"></span>
      <div class="bh-text"><h2>${escapeHTML(col.title)}</h2>
      ${col.subtitle ? `<div class="muted">${escapeHTML(col.subtitle)}</div>` : ''}</div>
      <span class="bh-count">${isLocked(col) ? '🔒' : `${solvedAll}/${col.puzzles.length}`}</span></summary>`;
    if (isLocked(col)) {
      if (filtering) return;
      book.insertAdjacentHTML('beforeend', `<div class="locked-card">
        <div class="lc-ic">🔒</div>
        <div class="lc-text">${col.error ? escapeHTML(col.error) : `Have the ${col.meta.edition ? escapeHTML(col.meta.edition) : 'book'}? Answer a question from it to unlock all ${col.meta.puzzles} puzzles.`}</div>
        <button class="pill-btn primary" data-unlock="${col.slug}">Unlock</button></div>`);
      main.appendChild(book);
      return;
    }
    const nextP = col.puzzles.find(p => progressOf(p).kind === 'progress') || col.puzzles.find(p => !isSolved(p));
    const single = col.samples || col.data.levels.length === 1;
    col.data.levels.forEach(lv => {
      const items = col.puzzles.filter(p => p.q.level === lv.level);
      const sec = document.createElement(single ? 'section' : 'details');
      sec.className = 'lib-group';
      const head = single ? escapeHTML(lv.name) : `Level ${lv.level} · ${escapeHTML(lv.name)}`;
      const headHTML = `<span class="chev" aria-hidden="true"></span><h2>${head}</h2><span class="lg-count">${items.filter(isSolved).length}/${items.length}</span>`;
      if (single) sec.innerHTML = `<div class="lg-head">${headHTML}</div>`;
      else {
        sec.dataset.key = `lv:${col.slug}:${lv.level}`;
        sec.open = isOpen(sec.dataset.key, !!nextP && nextP.q.level === lv.level);
        sec.innerHTML = `<summary class="lg-head">${headHTML}</summary>`;
      }
      sec.insertAdjacentHTML('beforeend', `${lv.desc ? `<p class="lg-desc">${escapeHTML(lv.desc)}</p>` : ''}<ul class="card-list"></ul>`);
      const ul = $('ul', sec);
      items.forEach(p => {
        const pr = progressOf(p);
        if (filter !== 'all' && pr.kind !== filter) return;
        const li = document.createElement('li');
        li.innerHTML = `<a href="${href(p)}"><canvas width="88" height="88"></canvas>
          <div class="pl-main"><div class="pl-title">${p.number}. ${escapeHTML(p.title)}</div>
          <div class="pl-meta">${p.cols}×${p.rows}${helperText(p) ? ' · ' + helperText(p) : ''}</div></div>
          <span class="pl-status ${pr.kind}">${pr.label}</span></a>`;
        drawThumb($('canvas', li), p, pr.s);
        ul.appendChild(li);
      });
      (col.data.certificates || []).filter(c => c.after >= lv.first && c.after <= lv.last).forEach(c => {
        if (filter !== 'all') return;
        const earned = certEarned(col, c);
        const li = document.createElement('li');
        li.innerHTML = `<button class="cert-row ${earned ? 'earned' : ''}" data-cert="${col.slug}:${c.after}">
          <span class="cert-ic">${earned ? '🏆' : '🔒'}</span>
          <div class="pl-main"><div class="pl-title">${escapeHTML(c.title)} certificate</div>
          <div class="pl-meta">${earned ? 'Earned! Tap to see it.' : `Solve puzzles 1–${c.after} to earn it.`}</div></div></button>`;
        ul.appendChild(li);
      });
      if (ul.children.length) book.appendChild(sec);
    });
    if (!filtering || book.querySelector('.card-list li')) main.appendChild(book);
  });
}

// Remember folders the user opens or closes (only real clicks, not the defaults or a filter)
$('#homeMain').addEventListener('click', ev => {
  const s = ev.target.closest('summary');
  if (!s || filter !== 'all') return;
  const d = s.parentElement;
  if (!d.dataset.key) return;
  const opened = store.get(OPEN_KEY, {});
  opened[d.dataset.key] = !d.open;   // the click is about to toggle it
  store.set(OPEN_KEY, opened);
});

$('#homeMain').addEventListener('click', ev => {
  const u = ev.target.closest('[data-unlock]');
  if (u) { openUnlock(colBySlug(u.dataset.unlock)); return; }
  const b = ev.target.closest('[data-cert]');
  if (!b) return;
  const [slug, after] = b.dataset.cert.split(':');
  const col = colBySlug(slug), c = col.data.certificates.find(x => x.after === +after);
  if (!certEarned(col, c)) { toast(`Solve puzzles 1–${c.after} to earn this one.`); return; }
  openSheet('Certificate', `<div class="certificate"><div class="c-top">${escapeHTML(col.meta ? col.meta.title : col.title)}</div>
    <div class="c-title">${escapeHTML(c.title)}</div><div class="c-line">This certifies that you ${escapeHTML(c.line)}</div>
    <div class="c-star">🏆</div></div>`);
});

function drawThumb(cv, p, s) {
  const ctx = cv.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const size = cv.width, pitch = size / Math.max(p.rows, p.cols), g = Math.max(1, pitch * .1);
  const col = { block: css.getPropertyValue('--block'), fill: css.getPropertyValue('--word'), tile: css.getPropertyValue('--tile') };
  ctx.clearRect(0, 0, size, size);
  const letters = s && s.sig === p.sig ? s.letters : null;
  p.cells.forEach((c, i) => {
    ctx.fillStyle = c.block ? col.block : letters && letters[i] ? col.fill : col.tile;
    ctx.fillRect((i % p.cols) * pitch, Math.floor(i / p.cols) * pitch, pitch - g, pitch - g);
  });
}

$('#filterSeg').addEventListener('click', ev => {
  const b = ev.target.closest('button'); if (!b) return;
  filter = b.dataset.f;
  $$('#filterSeg button').forEach(x => x.classList.toggle('on', x === b));
  renderHome();
});

/* ---------- unlocking a book ---------- */
async function openUnlock(col) {
  let locks;
  try { locks = await getLocks(col.meta); } catch (e) { toast(e.message); return; }
  const questions = locks.boxes.filter(b => b.kind === 'question');
  let qi = Math.floor(Math.random() * questions.length);
  let mode = questions.length ? 'question' : 'invite';

  const draw = () => {
    const q = questions[qi];
    const body = openSheet(`Unlock ${col.title}`, mode === 'question' ? `
      <p class="note">Answer a question from your copy of the book. The answers are in the answer key at the back.</p>
      <form id="unlockForm" autocomplete="off">
        <div class="q-prompt">${escapeHTML(q.prompt)}</div>
        ${Array.from({ length: q.fields }, (_, i) => `<input class="field ans" placeholder="Answer ${i + 1}" autocapitalize="characters" autocorrect="off" spellcheck="false">`).join('')}
        <div class="btn-row"><button class="pill-btn primary" type="submit">Unlock</button>
          ${questions.length > 1 ? '<button class="pill-btn subtle" type="button" id="otherQ">Try a different question</button>' : ''}</div>
        <p class="status-line" id="unlockStatus"></p>
      </form>
      <p class="note"><a href="#" id="switchMode">I have an invite code</a></p>` : `
      <p class="note">Type the invite code you were given.</p>
      <form id="unlockForm" autocomplete="off">
        <input class="field" id="inviteCode" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" autocorrect="off" spellcheck="false">
        <div class="btn-row"><button class="pill-btn primary" type="submit">Unlock</button></div>
        <p class="status-line" id="unlockStatus"></p>
      </form>
      ${questions.length ? '<p class="note"><a href="#" id="switchMode">Answer a question from the book instead</a></p>' : ''}`);
    const first = $('input', body); first && first.focus();
    const other = $('#otherQ', body);
    if (other) other.onclick = () => { qi = (qi + 1 + Math.floor(Math.random() * (questions.length - 1))) % questions.length; draw(); };
    const sw = $('#switchMode', body);
    if (sw) sw.onclick = ev => { ev.preventDefault(); mode = mode === 'question' ? 'invite' : 'question'; draw(); };
    $('#unlockForm', body).onsubmit = async ev => {
      ev.preventDefault();
      const st = $('#unlockStatus', body), btn = $('button[type=submit]', body);
      const attempt = mode === 'question'
        ? { box: q, answers: $$('.ans', body).map(i => i.value) }
        : { code: $('#inviteCode', body).value };
      if (mode === 'question' ? attempt.answers.some(a => !a.trim()) : !attempt.code.trim()) {
        st.textContent = mode === 'question' ? 'Type all the answers first.' : 'Type the code first.'; st.className = 'status-line err'; return;
      }
      st.textContent = 'Checking…'; st.className = 'status-line'; btn.disabled = true;
      let ok = false;
      try { ok = await unlock(col.meta, locks, attempt); } catch (e) { st.textContent = e.message; st.className = 'status-line err'; btn.disabled = false; return; }
      if (!ok && mode === 'invite') {
        // A code for another collection (e.g. a hidden one) typed here: unlock that one instead
        for (const other of COLS.filter(c => c !== col && isLocked(c))) {
          try {
            if (!(await unlock(other.meta, await getLocks(other.meta), attempt))) continue;
            Object.assign(other, makeCol(other.slug, other.title, other.subtitle, await openBook(other.meta), other.meta));
          } catch (e) { continue; }
          closeSheet(); renderHome(); toast(`${other.title} is unlocked on this device!`);
          return;
        }
      }
      if (!ok) {
        st.textContent = mode === 'question' ? 'That doesn’t match. Check the spelling, or try a different question.' : 'That code doesn’t match. Check it and try again.';
        st.className = 'status-line err'; btn.disabled = false; return;
      }
      try {
        const data = await openBook(col.meta);
        Object.assign(col, makeCol(col.slug, col.title, col.subtitle, data, col.meta));
      } catch (e) { col.error = e.message; }
      closeSheet(); renderHome();
      toast(`${col.title} is unlocked on this device!`);
    };
  };
  draw();
}

/* ---------- settings (from the library) ---------- */
$('#homeSettingsBtn').addEventListener('click', () => {
  const books = COLS.filter(c => !c.samples && !isHidden(c));
  const body = openSheet('Settings', settingsHTML() + `
    <h3>Books on this device</h3>
    <div class="group">${books.map(c => `<div class="row"><span>${escapeHTML(c.title)}</span><small>${c.data ? 'Unlocked' : 'Locked'}</small></div>`).join('')}</div>
    <h3>Have a code?</h3>
    <form id="codeForm" autocomplete="off">
      <input class="field" id="anyCode" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" autocorrect="off" spellcheck="false">
      <div class="btn-row"><button class="pill-btn primary" type="submit">Unlock</button></div>
      <p class="status-line" id="codeStatus"></p>
    </form>
    ${books.some(c => c.data) ? `<div class="btn-row"><button class="pill-btn subtle danger" id="lockAll">Lock books on this device</button></div>
      <p class="note">Locking removes the unlock from this device. Your progress is kept.</p>` : ''}`);
  bindSettings(body);
  $('#codeForm', body).onsubmit = async ev => {
    ev.preventDefault();
    const code = $('#anyCode', body).value, st = $('#codeStatus', body), btn = $('#codeForm button', body);
    if (!code.trim()) return;
    st.textContent = 'Checking…'; st.className = 'status-line'; btn.disabled = true;
    // Try the code on every locked collection, hidden ones first
    const locked = COLS.filter(isLocked).sort((a, b) => (b.meta.hidden ? 1 : 0) - (a.meta.hidden ? 1 : 0));
    for (const col of locked) {
      try {
        if (!(await unlock(col.meta, await getLocks(col.meta), { code }))) continue;
        Object.assign(col, makeCol(col.slug, col.title, col.subtitle, await openBook(col.meta), col.meta));
        closeSheet(); renderHome(); toast(`${col.title} is unlocked on this device!`);
        return;
      } catch (e) { st.textContent = e.message; st.className = 'status-line err'; btn.disabled = false; return; }
    }
    st.textContent = 'That code doesn’t match anything. Check it and try again.'; st.className = 'status-line err'; btn.disabled = false;
  };
  const la = $('#lockAll', body);
  if (la) la.onclick = async () => {
    if (!confirm('Lock all books on this device? You can unlock them again later.')) return;
    await forgetAllKeys(); location.hash = ''; location.reload();
  };
});

/* ---------- views & routing ---------- */
function showView(name) {
  for (const v of ['home', 'solver', 'loading']) $('#' + v).hidden = v !== name;
}

function route() {
  if (currentPuzzle()) closePuzzle();
  const m = location.hash.match(/^#\/p\/([\w-]+)\/(\d+)$/);
  const col = m && colBySlug(m[1]);
  const p = col && col.puzzles.find(x => x.number === +m[2]);
  if (p) { showView('solver'); openPuzzle(p); layout(); }
  else { if (location.hash) history.replaceState(null, '', location.pathname); showView('home'); renderHome(); }
}
addEventListener('hashchange', route);
$('#closeBtn').addEventListener('click', () => { location.hash = ''; });

initSolver({
  onSolved() {},
  onNext(n) {
    const cur = currentPuzzle(), col = cur && colBySlug(cur.slug);
    if (!col) { location.hash = ''; return; }
    const later = col.puzzles.find(p => p.number > n && !isSolved(p)) || col.puzzles.find(p => !isSolved(p));
    location.hash = later ? href(later) : '';
  },
});

(async function start() {
  showView('loading');
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  let lib;
  try { lib = await loadLibrary(); }
  catch (e) { $('#loading p').textContent = `${e.message} Check your connection and open the app again.`; return; }
  COLS = [];
  if (lib.samples) COLS.push(makeCol('samples', lib.samples.book.title, lib.samples.book.subtitle, lib.samples));
  for (const b of lib.books) {
    const col = makeCol(b.slug, nameOf(b), b.subtitle, null, b);
    if (b.key) {
      try { Object.assign(col, makeCol(b.slug, nameOf(b), b.subtitle, await openBook(b), b)); }
      catch (e) {
        if (e.name === 'OperationError') { await forgetKey(b.slug); b.key = null; }   // the book was re-keyed: unlock again
        else col.error = `${e.message} Check your connection and open the app again.`;
      }
    }
    COLS.push(col);
  }
  route();
})();
