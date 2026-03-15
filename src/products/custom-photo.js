/* ── Custom Photo Nutrition Parsing ───────────────────────── */

import { cfg } from '../state.js';
import { fillCustomFields } from './custom-ui.js';
import { hasAiProxyConfig } from '../ai/providers.js';

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
  if (!hasAiProxyConfig()) {
    btn.textContent = '⚠️ AI niet beschikbaar';
    btn.disabled = false;
    setTimeout(() => {
      btn.textContent = '📸 Foto';
    }, 3000);
    return;
  }

  const prompt = 'Analyseer deze foto van een voedingswaarden-etiket. Geef de waarden per 100g in dit JSON format: {"naam":"productnaam","kcal":0,"kh":0,"vz":0,"vet":0,"eiwit":0,"portie":"","merk":""}. Antwoord ALLEEN met de JSON.';

  try {
    const response = await fetch(`${cfg.sbUrl}/functions/v1/ai-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.sbKey,
        'Authorization': 'Bearer ' + cfg.sbKey,
      },
      body: JSON.stringify({
        provider,
        model: model || (provider === 'openai' ? 'gpt-4o-mini' : provider === 'gemini' ? 'gemini-2.5-flash' : 'claude-haiku-4-5-20250514'),
        user: prompt,
        maxTokens: 500,
        imageData: base64,
        imageMimeType: mimeType,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `AI-proxy fout (${response.status})`);
    const result = payload?.text || '';

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
