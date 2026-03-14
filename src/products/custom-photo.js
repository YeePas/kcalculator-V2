/* ── Custom Photo Nutrition Parsing ───────────────────────── */

import { cfg } from '../state.js';
import { fillCustomFields } from './custom-ui.js';

export function resizeImage(file, maxDim = 800) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round(h * maxDim / w);
            w = maxDim;
          } else {
            w = Math.round(w * maxDim / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function handleCustomPhoto(file) {
  const btn = document.getElementById('custom-photo-btn');
  if (!file) return;

  const preview = document.getElementById('custom-photo-preview');
  if (preview) {
    const previewReader = new FileReader();
    previewReader.onload = (ev) => {
      preview.src = ev.target.result;
      preview.style.display = 'block';
    };
    previewReader.readAsDataURL(file);
  }

  btn.textContent = '📸 Verkleinen…';
  btn.disabled = true;
  const dataUrl = await resizeImage(file);
  const base64 = dataUrl.split(',')[1];
  const mimeType = dataUrl.split(';')[0].split(':')[1];

  btn.textContent = '🤖 Analyseren…';
  const selModel = document.getElementById('custom-photo-model')?.value || '';
  const [provider, model] = selModel.includes('|') ? selModel.split('|') : [cfg.provider || 'claude', selModel];
  const key = (cfg.keys && cfg.keys[provider]) || cfg.claudeKey;

  if (!key) {
    btn.textContent = '⚠️ Geen API key';
    btn.disabled = false;
    setTimeout(() => {
      btn.textContent = '📸 Foto';
    }, 3000);
    return;
  }

  const prompt = 'Analyseer deze foto van een voedingswaarden-etiket. Geef de waarden per 100g in dit JSON format: {"naam":"productnaam","kcal":0,"kh":0,"vz":0,"vet":0,"eiwit":0,"portie":"","merk":""}. Antwoord ALLEEN met de JSON.';

  try {
    let result;
    if (provider === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: model || 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } }, { type: 'text', text: prompt }] }],
        }),
      });
      const d = await r.json();
      result = d.content?.[0]?.text || '';
    } else if (provider === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.5-flash'}:generateContent?key=${key}`, {
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
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl } }, { type: 'text', text: prompt }] }],
          max_tokens: 500,
        }),
      });
      const d = await r.json();
      result = d.choices?.[0]?.message?.content || '';
    }

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      fillCustomFields(
        parsed.naam || '',
        parsed.kcal || 0,
        parsed.kh || parsed.koolhydraten_g || 0,
        parsed.vz || parsed.vezels_g || 0,
        parsed.vet || parsed.vetten_g || 0,
        parsed.eiwit || parsed.eiwitten_g || 0,
        parsed.portie ? parseInt(parsed.portie) : undefined
      );
      if (parsed.merk) {
        const merkEl = document.getElementById('custom-merk');
        if (merkEl) merkEl.value = parsed.merk;
      }
      btn.textContent = '✓ Geanalyseerd!';
      btn.style.color = 'var(--green)';
    } else {
      btn.textContent = '✗ Niet herkend';
    }
  } catch (e) {
    btn.textContent = '✗ ' + e.message;
  }

  btn.disabled = false;
  setTimeout(() => {
    btn.textContent = '📸 Foto';
    btn.style.color = '';
  }, 4000);
}
