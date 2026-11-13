// On-screen keyboard for phones and iPads (avoids the system keyboard covering the grid).
const BACK = '<svg viewBox="0 0 24 24"><path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7 6-7Z"/><path d="M12 9l6 6M18 9l-6 6"/></svg>';
const DIR = '<svg viewBox="0 0 24 24"><path d="M7 4v13M3.5 13.5 7 17l3.5-3.5M13 7h8M17.5 3.5 21 7l-3.5 3.5"/></svg>';

/** onKey receives 'A'..'Z', 'back' or 'dir'. */
export function buildKeyboard(el, onKey) {
  const rows = ['qwertyuiop', 'asdfghjkl', '^zxcvbnm<'];
  el.innerHTML = rows.map(r => '<div class="kb-row">' + Array.from(r).map(ch =>
    ch === '<' ? `<button class="wide" data-k="back" aria-label="Delete">${BACK}</button>`
      : ch === '^' ? `<button class="wide" data-k="dir" aria-label="Switch direction">${DIR}</button>`
        : `<button data-k="${ch.toUpperCase()}">${ch}</button>`).join('') + '</div>').join('');
  el.addEventListener('pointerdown', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    ev.preventDefault();
    onKey(b.dataset.k);
  });
}
