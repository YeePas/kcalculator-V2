/* ── AI Food Parsing ───────────────────────────────────────── */
/* Faithful port of parseFood from index.html */

import { cfg, localData, currentDate, nevoReady, selMeal } from '../state.js';
import { MEAL_LABELS } from '../constants.js';
import { dateKey } from '../utils.js';
import { aiCall, assertAiAvailable } from './providers.js';
import { searchNevo } from '../products/database.js';
import { loadDay } from '../supabase/data.js';

export async function parseFood(text, meal) {
  assertAiAvailable();
  const isDrink = meal === 'drinken';
  const provider = cfg.provider || 'claude';

  const gistDatum = dateKey(new Date(Date.now() - 86400000));
  if (!localData[gistDatum]) localData[gistDatum] = await loadDay(gistDatum);

  function dagSamenvatting(dagData, label) {
    if (!dagData) return '';
    const lines = [];
    ['ontbijt', 'ochtendsnack', 'lunch', 'middagsnack', 'avondeten', 'avondsnack'].forEach(m => {
      const items = dagData[m] || [];
      if (items.length) {
        const omschrijving = items.map(i =>
          `${i.naam}${i.portie ? ' (' + i.portie + ')' : ''}: ${i.kcal}kcal, ${i.koolhydraten_g}g koolh, ${i.vezels_g || 0}g vezel, ${i.vetten_g}g vet, ${i.eiwitten_g}g eiwit`
        ).join(' | ');
        lines.push(`  ${m}: ${omschrijving}`);
      }
    });
    return lines.length ? `${label}:\n${lines.join('\n')}` : '';
  }

  const vandaagCtx = dagSamenvatting(localData[currentDate], 'Vandaag al gegeten');
  const gistCtx = dagSamenvatting(localData[gistDatum], 'Gisteren gegeten');
  const contextStr = [vandaagCtx, gistCtx].filter(Boolean).join('\n\n');

  if (/gister|gisteren|zelfde|vorige|weer|opnieuw/i.test(text) && !gistCtx && !vandaagCtx) {
    throw new Error('Geen maaltijden van gisteren gevonden — voer ze in via de ‹ knop');
  }

  let nevoContext = '';
  if (nevoReady) {
    const nevoResults = searchNevo(text);
    if (nevoResults.length > 0) {
      nevoContext = '\n\nDatabase resultaten (per 100g, officiële Nederlandse voedingswaarden):\n' +
        nevoResults.slice(0, 8).map(r =>
          `- ${r.n}: ${r.k}kcal, ${r.kh}g koolh, ${r.vz}g vezel, ${r.v}g vet, ${r.e}g eiwit`
        ).join('\n');
    }
  }

  const systemPrompt = `Je bent een nauwkeurige Nederlandse voedingsdeskundige.
PRIMAIRE BRON: Gebruik de NEVO-database waarden die hieronder meegegeven zijn. Deze zijn officieel van het RIVM (nevo-online.rivm.nl) en zijn altijd leidend.
SECUNDAIRE BRON: Als het product niet in de NEVO resultaten staat, gebruik web_search om te zoeken op voedingscentrum.nl of ah.nl.
TERTIAIRE BRON: Als je helemaal niks vindt, gebruik je eigen kennis op basis van NEVO-waarden.

Let op porties: de NEVO waarden zijn per 100g. Reken om naar de opgegeven portie.
Gebruik standaard porties als niet opgegeven: boterham=35g brood, glas melk=200ml, kop koffie=150ml, bord pasta=250g gekookt.
Geef ALTIJD correcte vezelwaarden — nooit 0 tenzij het product echt geen vezels bevat (bijv. suiker, olie, vlees).
Als de gebruiker verwijst naar eerder gegeten maaltijden, gebruik dan exact de waarden uit de context.
Na het zoeken antwoord je UITSLUITEND met een JSON array. Geen tekst ervoor of erna. Geen markdown. Alleen de array.`;

  const userPrompt = isDrink
    ? `De gebruiker zegt voor drinken: "${text}"\n${contextStr ? '\n' + contextStr : ''}${nevoContext}\n\nZoek de voedingswaarden op (NEVO-data hierboven → voedingscentrum.nl → eigen kennis als fallback).\nGeef daarna ALLEEN deze JSON array terug (geen tekst eromheen):\n[{"naam":"string","ml":number,"kcal":number,"koolhydraten_g":number,"vezels_g":number,"vetten_g":number,"eiwitten_g":number,"portie":"string"}]\nSchat ml als niet opgegeven (glas=200,beker=250,fles=500,kopje=150).`
    : `De gebruiker zegt voor ${meal}: "${text}"\n${contextStr ? '\n' + contextStr : ''}${nevoContext}\n\nZoek de voedingswaarden op (NEVO-data hierboven → voedingscentrum.nl → eigen kennis als fallback).\nGeef daarna ALLEEN deze JSON array terug (geen tekst eromheen):\n[{"naam":"string","kcal":number,"koolhydraten_g":number,"vezels_g":number,"vetten_g":number,"eiwitten_g":number,"portie":"string"}]`;

  const rawText = await aiCall(provider, systemPrompt, userPrompt, 2000, provider === 'claude');
  const clean = rawText.replace(/```json|```/g, '').trim();
  const match = clean.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Kon geen voedingswaarden herkennen — probeer specifieker');
  try { return JSON.parse(match[0]); }
  catch { throw new Error('Fout bij verwerken — probeer opnieuw'); }
}
