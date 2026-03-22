import { parseTextToItems, matchItemToNevo } from '../products/matcher.js';
import { openMatchModal } from '../modals/match.js';

export async function submit() {
  const input = document.getElementById('food-input');
  const status = document.getElementById('status');
  const text = input.value.trim();
  if (!text) return;

  const parsed = parseTextToItems(text);
  if (parsed.length > 0) {
    const matches = parsed.map(p => ({ parsed: p, match: matchItemToNevo(p) }));
    const matchCount = matches.filter(m => m.match).length;
    status.textContent = '🔍 ' + matchCount + '/' + parsed.length + ' producten herkend in database';
    status.className = 'status-msg';
    openMatchModal(parsed);
  } else {
    status.textContent = 'Kon geen producten herkennen — probeer specifieker';
    status.className = 'status-msg error';
  }
}
