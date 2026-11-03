// Gameplay settings, modelled on Apple News. Saved per device.
import { store } from './store.js';

export const DEFAULT_SETTINGS = { showTimer: false, linked: true, autocheck: true, skipFilled: true, endOfWord: 'stay' };
export const settings = Object.assign({}, DEFAULT_SETTINGS, store.get('settings', {}));
export const saveSettings = () => store.set('settings', settings);

export const settingsHTML = () => `
  <h3>Gameplay</h3>
  <div class="group">
    <label class="row"><span>Show Timer</span><input type="checkbox" data-set="showTimer"></label>
    <label class="row"><span>Highlight Linked Clues</span><input type="checkbox" data-set="linked"></label>
    <label class="row"><span>Always Autocheck</span><input type="checkbox" data-set="autocheck"></label>
  </div>
  <p class="note">Autocheck marks wrong letters in red as you type. It stays on for all crosswords.</p>
  <h3>After Entering a Letter</h3>
  <div class="group">
    <label class="row"><span>Skip Filled Squares</span><input type="checkbox" data-set="skipFilled"></label>
  </div>
  <div class="group" style="margin-top:14px">
    <label class="row"><span>At End of Word</span>
      <select data-set="endOfWord"><option value="stay">Don’t Advance</option><option value="next">Next Clue</option></select></label>
  </div>
  <p class="note">Choose when to advance to the next clue.</p>`;

export function bindSettings(root, onChange) {
  root.querySelectorAll('[data-set]').forEach(inp => {
    const k = inp.dataset.set;
    if (inp.type === 'checkbox') inp.checked = !!settings[k]; else inp.value = settings[k];
    inp.addEventListener('change', () => {
      settings[k] = inp.type === 'checkbox' ? inp.checked : inp.value;
      saveSettings();
      onChange && onChange(k);
    });
  });
}
