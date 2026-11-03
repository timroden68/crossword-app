// The library: free samples, and books that are locked until unlocked on this device.
//
// data/books.json lists the books. Each book's puzzles are published encrypted (data/books/<slug>.enc,
// gzip + AES-256-GCM). They unlock with a question from the printed book or an invite code
// (data/books/<slug>.locks.json); the content key is then kept on this device in IndexedDB, in a form
// the page can use but not read back. See docs/app-access-spec.md and app/scripts/build_access.py.

export const SUPPORTED_SCHEMA = 1;   // book.json / samples.json layout
const SUPPORTED_LIST = 1;            // books.json layout

function checkSchema(b, what) {
  if (!b || typeof b !== 'object' || typeof b.schema_version !== 'number' || !Array.isArray(b.puzzles))
    throw new Error(`The ${what} data doesn’t look right.`);
  if (b.schema_version > SUPPORTED_SCHEMA)
    throw new Error(`The ${what} data is newer than this app. Close the app and open it again to update it.`);
  return b;
}

async function getJSON(path) {
  const r = await fetch('data/' + path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Couldn’t load ${path} (${r.status}).`);
  return r.json();
}

/* ---------- content keys on this device (IndexedDB) ---------- */
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('crosswords', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('keys', mode), req = fn(tx.objectStore('keys'));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}
const getKey = slug => idb('readonly', s => s.get(slug)).catch(() => null);
const putKey = (slug, key) => idb('readwrite', s => s.put(key, slug));
export const forgetKey = slug => idb('readwrite', s => s.delete(slug)).catch(() => {});
export const forgetAllKeys = () => idb('readwrite', s => s.clear()).catch(() => {});

/** { samples, books:[{slug,title,subtitle,...,key}] } — key is null for a locked book. */
export async function loadLibrary() {
  const list = await getJSON('books.json');
  if (list.schema_version > SUPPORTED_LIST) throw new Error('This app needs updating. Close it and open it again.');
  const samples = list.samples ? checkSchema(await getJSON(list.samples), 'sample') : null;
  const books = await Promise.all(list.books.map(async b => ({ ...b, key: await getKey(b.slug) })));
  return { samples, books };
}

/** Decrypts an unlocked book. */
export async function openBook(b) {
  const r = await fetch('data/' + b.data, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Couldn’t load ${b.title} (${r.status}).`);
  const buf = await r.arrayBuffer();
  const gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, b.key, buf.slice(12));
  const text = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return checkSchema(JSON.parse(text), b.title);
}

/* ---------- unlocking ---------- */
const norm = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export const getLocks = b => getJSON(b.locks);

async function deriveKEK(secret, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base,
    { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}

/** Tries a question's answers ({ box, answers }) or an invite code ({ code }). Returns true if it unlocked. */
export async function unlock(b, locks, { box, answers, code }) {
  let kek, boxes;
  if (code != null) {
    kek = await deriveKEK(norm(code), unb64(locks.invite_salt), locks.iterations);
    boxes = locks.boxes.filter(x => x.kind === 'invite');
  } else {
    kek = await deriveKEK(answers.map(norm).join('|'), unb64(box.salt), locks.iterations);
    boxes = [box];
  }
  for (const x of boxes) {
    let raw;
    try { raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(x.iv) }, kek, unb64(x.wrapped)); } catch { continue; }
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    await putKey(b.slug, key);
    b.key = key;
    return true;
  }
  return false;
}

/* ---------------- puzzle model ---------------- */

/** A short fingerprint of a puzzle's answers; saved progress is dropped if the grid changes. */
export function signature(q) {
  const s = q.size + '|' + q.entries.map(e => `${e.dir[0]}${e.row},${e.col}${e.answer}`).sort().join('|');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function buildPuzzle(q, book, slug) {
  const size = q.size, rows = size, cols = size;
  const cells = Array.from({ length: rows * cols }, () => ({ block: true }));
  const entries = { across: [], down: [] };
  for (const e of q.entries) {
    const dir = e.dir === 'down' ? 'down' : 'across';
    const idx = [];
    for (let k = 0; k < e.answer.length; k++) {
      const i = (e.row + (dir === 'down' ? k : 0)) * cols + e.col + (dir === 'across' ? k : 0);
      cells[i].block = false; cells[i].sol = e.answer[k].toUpperCase();
      idx.push(i);
    }
    cells[idx[0]].num = e.num;
    entries[dir].push({ dir, num: e.num, cells: idx, clue: e.clue || '', answer: e.answer.toUpperCase() });
  }
  for (const d of ['across', 'down']) {
    entries[d].sort((a, b) => a.num - b.num);
    entries[d].forEach((e, k) => e.cells.forEach(i => (cells[i][d] = k)));
  }
  const all = [...entries.across, ...entries.down];
  // "With 5-Down" style references, for Highlight Linked Clues
  all.forEach(e => {
    e.refs = [];
    const re = /((?:\d+\s*-?\s*(?:,|and|&|or)?\s*)+)-?\s*(Across|Down)\b/gi;
    let m;
    while ((m = re.exec(e.clue))) {
      const dir = m[2].toLowerCase();
      (m[1].match(/\d+/g) || []).forEach(n => {
        const t = entries[dir].find(x => x.num === +n);
        if (t && t !== e) e.refs.push(t);
      });
    }
  });
  all.forEach(e => e.refs.forEach(t => { if (!t.refs.includes(e)) t.refs.push(e); }));

  const level = book.levels.find(l => l.level === q.level) || { name: '' };
  const themeWords = new Set(q.theme_words.map(w => w.toUpperCase()));
  return {
    id: slug + '/' + q.number, slug, number: q.number, q, rows, cols, cells, entries, all,
    title: q.title || `Puzzle ${q.number}`,
    levelName: level.name,
    multiLevel: book.levels.length > 1,
    show: q.show,
    tips: q.tips || [],
    theme: q.theme,
    themeName: book.hunt_names[q.theme] || q.theme,
    themeWords,
    themeCells: new Set(all.filter(e => themeWords.has(e.answer)).flatMap(e => e.cells)),
    given: new Set((q.revealed || []).map(([r, c]) => r * cols + c).filter(i => cells[i] && !cells[i].block)),
    circles: new Set((q.circles || []).map(([r, c]) => r * cols + c).filter(i => cells[i] && !cells[i].block)),
    certificate: book.certificates.find(c => c.after === q.number) || null,
    sig: signature(q),
  };
}
