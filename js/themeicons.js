// Theme icons, copied from web/solver.template.html (artwork, not puzzle data).
// Copy again if the book's icons change.
export const ICONS = {
  animal: '<ellipse cx="12" cy="16" rx="5" ry="4.2"/><ellipse cx="6" cy="10" rx="2.1" ry="2.7"/><ellipse cx="10" cy="6.5" rx="2.1" ry="2.7"/><ellipse cx="14" cy="6.5" rx="2.1" ry="2.7"/><ellipse cx="18" cy="10" rx="2.1" ry="2.7"/>',
  food: '<path d="M12 7c-2-2-7-2-7 4 0 5 3 10 5 10 1 0 1.3-.6 2-.6s1 .6 2 .6c2 0 5-5 5-10 0-6-5-6-7-4z"/><path d="M12 7c0-2 1-4 3-5l.8 1c-1.6 1-2.3 2.4-2.3 4z"/>',
  nature: '<path d="M12 2 5 13h4l-3 5h12l-3-5h4z"/><rect x="10.8" y="18" width="2.4" height="4"/>',
  home: '<path d="M12 3 2 12h3v9h5v-6h4v6h5v-9h3z"/>',
  body: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>',
  clothes: '<path d="M8 3 3 6l2 5 2-1v11h10V10l2 1 2-5-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z"/>',
  vehicle: '<path d="M3 15v-3l2-5h11l3 5h2v3z"/><circle cx="7" cy="17" r="2.3"/><circle cx="17" cy="17" r="2.3"/>',
  weather: '<path d="M7 19a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6-1.3A4.7 4.7 0 0 1 17 19z"/>',
  music: '<path d="M9 17.5V5l10-2v11.5a3 3 0 1 1-2-2.8V6.4l-6 1.2v9.9A3 3 0 1 1 9 17.5z"/>',
  space: '<circle cx="12" cy="12" r="5.5"/><ellipse cx="12" cy="12" rx="10.5" ry="3" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-20 12 12)"/>',
  school: '<path d="M10 2h4v14l-2 5-2-5z"/>',
  star: '<path d="m12 2 2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z"/>'
};

export const themeIcon = t =>
  `<svg class="ticon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[t] || ICONS.star}</svg>`;
