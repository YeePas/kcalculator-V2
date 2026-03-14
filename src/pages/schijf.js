/* ── Schijf van Vijf Analysis ─────────────────────────────── */

import { localData, currentDate, goals } from '../state.js';
import { dateKey, dayTotals } from '../utils.js';
import { loadDay } from '../supabase/data.js';
import { MEAL_NAMES } from '../constants.js';

export function schijfCategorie(naam) {
  const n = (naam || '').toLowerCase();
  const cats = {
    groente: /groente|sla|tomaat|komkommer|paprika|wortel|broccoli|spinazie|bloemkool|courgette|aubergine|champignon|ui|prei|biet|boerenkool|andijvie|sperzieboon|snijboon|kool|radijs|selderij|venkel|asperge|pompoen|rucola|mais|erwt|tuinboon/,
    fruit: /fruit|appel|peer|banaan|aardbei|frambozen|blauwe.?bessen|druif|druiven|kiwi|sinaasappel|mandarijn|mango|ananas|meloen|watermeloen|nectarine|perzik|pruim|kers|granaatappel|vijg|abrikoos|passievrucht|lychee|limoen|citroen|grapefruit/,
    volkoren: /volkoren|zilvervlies|haver|havermout|muesli|granola|rogge|spelt|quinoa|boekweit|bulgur|couscous.?volkoren|bruin.?brood|meergranen|pumpernikkel|crackers.?volkoren/,
    zuivel: /melk|yoghurt|kwark|skyr|kaas|cottage|zuivel|karnemelk|room|cr.?me fra.?che|ricotta|mozzarella|feta|brie|gouda|edammer|camembert|mascarpone/,
    eiwit: /kip|kipfilet|kalkoen|vis|zalm|tonijn|garnaal|ei|eieren|tofu|tempeh|seitan|linzen|kikkererwten|bonen|peulvrucht|noten|amandel|walnoot|cashew|pinda|pistache|rundvlees|varkensvlees|lam|gehakt|biefstuk|hamburger|worst|spek|ham|filet|kabeljauw|makreel|haring|sardine|forel|pangasius/,
    onverzadigd_vet: /olijfolie|zonnebloem|lijnzaad|chiazaad|avocado|noten|amandel|walnoot|pinda|cashew|pistache|hennepzaad|pompoenpit|zonnebloempit/,
    beperken: /suiker|snoep|chips|koek|taart|gebak|chocola|frisdrank|saus|ketchup|mayonaise|frituur|patat|frites|croissant|donut|ijs|slagroom|worst|spek|bacon|salami|cervelaat|leverworst|bier|wijn|alcohol|likeur|energy.?drink|siroop/,
  };

  const found = [];
  for (const [cat, regex] of Object.entries(cats)) {
    if (regex.test(n)) found.push(cat);
  }
  if (found.includes('fruit') && found.includes('groente')) {
    return ['fruit'];
  }
  return found.length ? found : ['overig'];
}

export function schijfDagScore(day) {
  const items = [];
  MEAL_NAMES.forEach(m => {
    for (const item of (day[m] || [])) {
      const gram = parseFloat(item.portie) || 100;
      const cats = schijfCategorie(item.naam);
      items.push({ naam: item.naam, gram, cats, item });
    }
  });

  const totalen = { groente:0, fruit:0, volkoren:0, zuivel:0, eiwit:0, onverzadigd_vet:0, beperken:0 };
  const catItems = { groente:[], fruit:[], volkoren:[], zuivel:[], eiwit:[], onverzadigd_vet:[], beperken:[] };

  for (const it of items) {
    for (const cat of it.cats) {
      if (totalen[cat] !== undefined) {
        totalen[cat] += it.gram;
        catItems[cat].push(it.naam);
      }
    }
  }

  const scores = {
    groente:    Math.min(totalen.groente / 250, 1),
    fruit:      Math.min(totalen.fruit / 200, 1),
    volkoren:   Math.min(totalen.volkoren / 150, 1),
    zuivel:     Math.min(totalen.zuivel / 300, 1),
    eiwit:      Math.min(totalen.eiwit / 100, 1),
    onverzadigd_vet: Math.min(totalen.onverzadigd_vet / 30, 1),
    beperken:   Math.max(1 - totalen.beperken / 200, 0),
  };

  const weights = { groente:2, fruit:2, volkoren:1.5, zuivel:1, eiwit:1.5, onverzadigd_vet:1, beperken:1 };
  let weightedSum = 0, totalWeight = 0;
  for (const [cat, score] of Object.entries(scores)) {
    const w = weights[cat] || 1;
    weightedSum += score * w;
    totalWeight += w;
  }

  return {
    score: Math.round(weightedSum / totalWeight * 100),
    scores, totalen, catItems,
  };
}

export const ADVIES_TEKSTEN = {
  groente_laag: [
    'Voeg een handje cherry-tomaatjes toe bij de lunch — makkelijk en snel.',
    'Probeer vanavond een extra portie groente bij het avondeten, zoals geroosterde broccoli.',
    'Een komkommer of wortel als tussendoortje brengt je snel dichter bij je doel.',
    'Soep telt ook! Een kop groentesoep is een makkelijke boost.',
    'Probeer een salade als bijgerecht — hoeft niet ingewikkeld.',
    'Diepvriesgroenten zijn net zo voedzaam en altijd voorhanden.',
    'Roerbakgroenten in 10 minuten klaar: paprika, courgette, champignons.',
    'Voeg spinazie toe aan je smoothie of omelet — je proeft het nauwelijks.',
    'Een bakje gemengde salade bij de supermarkt is een snelle oplossing.',
    'Begin met een klein schaaltje rauwkost voor je maaltijd.',
  ],
  suiker_hoog: [
    'Probeer fruit als dessert in plaats van iets zoets.',
    'Vervang frisdrank door water met een schijfje citroen of komkommer.',
    'Kies voor ongezoet yoghurt en voeg zelf vers fruit toe.',
    'Een stuk pure chocola (70%+) bevredigt je zoete trek met minder suiker.',
    'Thee of koffie zonder suiker went snel — probeer het een week.',
    'Havermout met kaneel smaakt zoet zonder toegevoegde suiker.',
    'Let op verborgen suikers in sauzen, muesli en yoghurtdrinks.',
    'Noten of een rijstwafel als tussendoortje in plaats van een koek.',
    'Zelfgemaakte smoothies met fruit zijn zoet genoeg zonder extra suiker.',
    'Bouw geleidelijk af — elke dag een beetje minder went snel.',
  ],
  eiwit_laag: [
    'Voeg een gekookt ei toe aan je lunch voor extra eiwit.',
    'Kwark of skyr als tussendoortje is een makkelijke eiwitboost.',
    'Peulvruchten (linzen, kikkererwten) zijn goedkope en voedzame eiwitbronnen.',
    'Probeer eens vis bij het avondeten — variatie is goed.',
    'Een handje noten (25g) levert eiwit plus gezonde vetten.',
  ],
  vezel_laag: [
    'Kies voor volkorenbrood in plaats van wit — meer vezels en langer verzadigd.',
    'Havermout als ontbijt is een uitstekende vezelbron.',
    'Voeg een eetlepel chiazaad of lijnzaad toe aan je yoghurt.',
    'Peulvruchten zijn kampioen vezels — linzensoep of hummus als snack.',
    'Meer groente en fruit eten helpt automatisch ook met je vezelinname.',
  ],
};

export function getAdviesTeksten(schijfResult, dayTot) {
  const tips = [];
  if (schijfResult.scores.groente < 0.5) {
    const pool = ADVIES_TEKSTEN.groente_laag;
    tips.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  if (schijfResult.scores.beperken < 0.5) {
    const pool = ADVIES_TEKSTEN.suiker_hoog;
    tips.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  if (dayTot.prot < (goals.prot || 60)) {
    const pool = ADVIES_TEKSTEN.eiwit_laag;
    tips.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  if (dayTot.fiber < (goals.fiber || 25)) {
    const pool = ADVIES_TEKSTEN.vezel_laag;
    tips.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  if (schijfResult.scores.fruit < 0.5) {
    tips.push('Probeer minimaal 2 stuks fruit per dag — als tussendoortje of bij het ontbijt.');
  }
  if (schijfResult.scores.volkoren < 0.3) {
    tips.push('Wissel witte pasta of rijst eens in voor de volkoren variant.');
  }
  return tips.slice(0, 3);
}

export async function renderSchijfAnalyse() {
  const body = document.getElementById('advies-body');
  body.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--muted)">Analyseren...</div>';

  const day = localData[currentDate] || await loadDay(currentDate);
  const result = schijfDagScore(day);
  const tot = dayTotals(day);

  const catLabels = {
    groente: { icon: '🥬', naam: 'Groente', doel: '250g' },
    fruit: { icon: '🍎', naam: 'Fruit', doel: '200g' },
    volkoren: { icon: '🌾', naam: 'Volkoren', doel: '150g' },
    zuivel: { icon: '🥛', naam: 'Zuivel', doel: '300g' },
    eiwit: { icon: '🥩', naam: 'Eiwitbronnen', doel: '100g' },
    onverzadigd_vet: { icon: '🥑', naam: 'Gezonde vetten', doel: '30g' },
    beperken: { icon: '⚠️', naam: 'Beperken', doel: '<200g' },
  };

  const scoreColor = result.score >= 70 ? 'var(--green)' : result.score >= 40 ? '#e8a020' : 'var(--danger)';

  let catRows = '';
  for (const [cat, info] of Object.entries(catLabels)) {
    const score = Math.round(result.scores[cat] * 100);
    const gram = Math.round(result.totalen[cat]);
    const items = result.catItems[cat] || [];
    const barColor = score >= 70 ? 'var(--green)' : score >= 40 ? '#e8a020' : 'var(--danger)';
    const itemsStr = items.length ? items.slice(0, 3).join(', ') + (items.length > 3 ? '...' : '') : '—';
    catRows += `<div style="margin-bottom:0.7rem">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.82rem;margin-bottom:0.2rem">
        <span>${info.icon} ${info.naam}</span>
        <span style="color:var(--muted);font-size:0.72rem">${gram}g / ${info.doel}</span>
      </div>
      <div style="background:var(--border);border-radius:4px;height:8px;overflow:hidden">
        <div style="background:${barColor};height:100%;width:${Math.min(score, 100)}%;border-radius:4px;transition:width 0.3s"></div>
      </div>
      <div style="font-size:0.68rem;color:var(--tertiary);margin-top:0.15rem">${itemsStr}</div>
    </div>`;
  }

  const tips = getAdviesTeksten(result, tot);
  const tipsHtml = tips.length
    ? '<div style="margin-top:1rem;padding:0.8rem;background:var(--bg);border-radius:10px;border:1px solid var(--border)"><div style="font-weight:500;font-size:0.82rem;margin-bottom:0.4rem">💡 Tips</div>' +
      tips.map(t => '<div style="font-size:0.8rem;color:var(--muted);margin-bottom:0.3rem">• ' + t + '</div>').join('') +
      '</div>'
    : '';

  body.innerHTML = `
    <div style="text-align:center;margin-bottom:1.2rem">
      <div style="font-size:2.8rem;font-weight:700;font-family:var(--font-display);color:${scoreColor}">${result.score}%</div>
      <div style="font-size:0.82rem;color:var(--muted)">Schijf van Vijf score — ${currentDate === dateKey(new Date()) ? 'vandaag' : new Date(currentDate+'T12:00:00').toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'})}</div>
    </div>
    ${catRows}
    ${tipsHtml}
  `;
}
