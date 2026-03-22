/* ── Smart Import: Photo Recognition ─────────────────────── */

import { cfg, authUser } from '../state.js';
import { resizeImage } from '../products/custom-photo.js';
import { estimateDishFromAIResponse } from '../ai/dish-import-service.js';
import { hasAiProxyConfig } from '../ai/providers.js';

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
  if (!hasAiProxyConfig()) {
    label.textContent = '📸 Foto';
    feedbackNear(label, '⚠️ AI-proxy niet beschikbaar', 'danger');
    return;
  }

  const prompt = 'Analyseer deze foto van voedsel of een voedingswaarden-etiket. Geef de waarden PER PORTIE in dit JSON format: {"recognizedDishName":"naam","confidence":"high|medium|low","portionSuggestion":{"label":"beschrijving","grams":100},"nutrition":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0},"assumptions":[],"alternatives":[]}. Antwoord ALLEEN met de JSON.';

  try {
    const response = await fetch(`${cfg.sbUrl}/functions/v1/ai-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.sbKey,
        'Authorization': 'Bearer ' + (authUser?.access_token || cfg.sbKey),
      },
      body: JSON.stringify({
        provider,
        model: model || (provider === 'openai' ? 'gpt-4o-mini' : provider === 'gemini' ? 'gemini-2.5-flash' : 'claude-haiku-4-5-20251001'),
        user: prompt,
        maxTokens: 600,
        imageData: base64,
        imageMimeType: mimeType,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `AI-proxy fout (${response.status})`);
    const result = payload?.text || '';

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

export async function handleRecipePhotoUpload(file, feedbackNear) {
  if (!file) return;

  const preview = document.getElementById('smart-photo-preview');
  const trigger = document.getElementById('smart-photo-label');
  const input = document.getElementById('smart-dish-input');
  if (!trigger || !input) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    if (!preview) return;
    preview.src = ev.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);

  trigger.textContent = '📸 Receptfoto verwerken…';
  trigger.disabled = true;

  const dataUrl = await resizeImage(file, 1400);
  const base64 = dataUrl.split(',')[1];
  const mimeType = dataUrl.split(';')[0].split(':')[1];

  if (!hasAiProxyConfig()) {
    trigger.textContent = '📸 Foto van recept';
    trigger.disabled = false;
    feedbackNear(trigger, '⚠️ AI-proxy niet beschikbaar', 'danger');
    return;
  }

  const provider = cfg.importProvider || cfg.provider || 'gemini';
  const model = cfg.importModel || cfg.model || '';
  const prompt = [
    'Lees deze foto van een recept, ingrediëntenlijst of kookboekpagina.',
    'Geef ALLEEN platte tekst terug die direct bruikbaar is in een gerecht-parser.',
    'Als er een gerechtnaam zichtbaar is, zet die op de eerste regel.',
    'Zet ingrediënten elk op een nieuwe regel, inclusief hoeveelheden als die zichtbaar zijn.',
    'Laat bereidingsstappen weg tenzij er geen ingrediëntenlijst zichtbaar is.',
    'Geen inleiding, geen markdown, geen bullets tenzij die al nuttig zijn voor een ingrediëntenlijst.',
  ].join(' ');

  try {
    const response = await fetch(`${cfg.sbUrl}/functions/v1/ai-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.sbKey,
        'Authorization': 'Bearer ' + (authUser?.access_token || cfg.sbKey),
      },
      body: JSON.stringify({
        provider,
        model: model || (provider === 'openai' ? 'gpt-4o-mini' : provider === 'gemini' ? 'gemini-2.5-flash' : 'claude-haiku-4-5-20251001'),
        user: prompt,
        maxTokens: 900,
        imageData: base64,
        imageMimeType: mimeType,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `AI-proxy fout (${response.status})`);

    const text = String(payload?.text || '').trim();
    if (!text) throw new Error('Geen tekst uit de receptfoto gehaald');

    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    trigger.textContent = '✓ Receptfoto geladen';
    feedbackNear(trigger, '✓ Tekst uit receptfoto in het invoerveld gezet', 'ok');
  } catch (error) {
    trigger.textContent = '📸 Foto van recept';
    feedbackNear(trigger, '✗ ' + (error?.message || 'Foto verwerken mislukt'), 'danger');
  } finally {
    trigger.disabled = false;
    setTimeout(() => {
      if (trigger) trigger.textContent = '📸 Foto van recept';
    }, 3000);
  }
}
