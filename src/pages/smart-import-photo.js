/* ── Smart Import: Photo Recognition ─────────────────────── */

import { cfg } from '../state.js';
import { resizeImage } from '../products/custom-photo.js';
import { estimateDishFromAIResponse } from '../ai/dish-import-service.js';

export async function handlePhotoUpload(file, renderCard, feedbackNear) {
  if (!file) return;
  const preview = document.getElementById('smart-photo-preview');
  const label = document.getElementById('smart-photo-label');

  const reader = new FileReader();
  reader.onload = ev => { preview.src = ev.target.result; preview.style.display = 'block'; };
  reader.readAsDataURL(file);

  label.textContent = '📸 Verkleinen…';
  const dataUrl = await resizeImage(file);
  const base64 = dataUrl.split(',')[1];
  const mimeType = dataUrl.split(';')[0].split(':')[1];

  label.textContent = '🤖 Analyseren…';
  const provider = cfg.importProvider || cfg.provider || 'gemini';
  const model = cfg.importModel || cfg.model || '';
  const key = cfg.keys?.[provider] || cfg.claudeKey;

  if (!key) {
    label.textContent = '📸 Foto';
    feedbackNear(label, '⚠️ Geen API key voor ' + provider, 'danger');
    return;
  }

  const prompt = 'Analyseer deze foto van voedsel of een voedingswaarden-etiket. Geef de waarden PER PORTIE in dit JSON format: {"recognizedDishName":"naam","confidence":"high|medium|low","portionSuggestion":{"label":"beschrijving","grams":100},"nutrition":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0},"assumptions":[],"alternatives":[]}. Antwoord ALLEEN met de JSON.';

  try {
    let result = '';
    if (provider === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: model || 'claude-haiku-4-5-20251001', max_tokens: 600, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } }, { type: 'text', text: prompt }] }] }),
      });
      const d = await r.json();
      result = d.content?.[0]?.text || '';
    } else if (provider === 'gemini') {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + (model || 'gemini-2.5-flash') + ':generateContent?key=' + key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }] }] }),
      });
      const d = await r.json();
      result = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model: model || 'gpt-4o-mini', messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl } }, { type: 'text', text: prompt }] }], max_tokens: 600 }),
      });
      const d = await r.json();
      result = d.choices?.[0]?.message?.content || '';
    }

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Geen JSON in AI-respons');
    const aiJson = JSON.parse(jsonMatch[0]);
    const proposal = estimateDishFromAIResponse(aiJson, 'Foto-analyse', provider);
    renderCard('smart-dish-result', proposal);
    label.textContent = '📸 Foto';
  } catch (e) {
    label.textContent = '📸 Foto';
    feedbackNear(label, '✗ ' + e.message, 'danger');
  }
}
