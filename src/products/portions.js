/* ── Portion Definitions ───────────────────────────────────── */
// Porties op basis van RIVM-groep + product-specifieke overrides
// Format: { t: type, g: gram, l: label }

// Standaard porties per RIVM-groep (numeric ID)
export const GROEP_PORTIES = {
  0:  [{ t:'portie', g:150, l:'portie' },{ t:'gram', g:100 }],                // Aardappelen
  1:  [{ t:'glas', g:200, l:'glas' },{ t:'fles', g:330, l:'flesje' },{ t:'blik', g:330, l:'blikje' },{ t:'ml', g:100 }],                      // Alcohol
  2:  [{ t:'snee', g:35, l:'snee' },{ t:'stuk', g:50, l:'broodje' },{ t:'gram', g:100 }], // Brood
  3:  [{ t:'gram', g:100 }],                                                   // Diversen
  4:  [{ t:'stuk', g:60, l:'ei' },{ t:'gram', g:100 }],                       // Eieren
  5:  [{ t:'ml', g:100 }],                                                     // Flesvoeding
  6:  [{ t:'stuk', g:130, l:'stuk' },{ t:'gram', g:100 }],                    // Fruit
  7:  [{ t:'stuk', g:40, l:'stuk' },{ t:'gram', g:100 }],                     // Gebak & koek
  8:  [{ t:'portie', g:75, l:'portie (droog)' },{ t:'gram', g:100 }],         // Graan
  9:  [{ t:'portie', g:100, l:'portie' },{ t:'gram', g:100 }],                // Groente
  10: [{ t:'eetlepel', g:15, l:'eetlepel' },{ t:'gram', g:100 }],             // Hartig beleg
  11: [{ t:'eetlepel', g:15, l:'eetlepel' },{ t:'gram', g:100 }],             // Sauzen
  12: [{ t:'stuk', g:30, l:'stuk' },{ t:'handje', g:25 },{ t:'gram', g:100 }], // Snacks
  13: [{ t:'plak', g:20, l:'plak' },{ t:'gram', g:100 }],                     // Kaas
  14: [{ t:'theelepel', g:3, l:'theelepel' },{ t:'gram', g:100 }],            // Kruiden
  15: [{ t:'portie', g:150, l:'portie' },{ t:'ml', g:100 }],                  // Melk
  16: [{ t:'glas', g:200, l:'glas' },{ t:'blik', g:330, l:'blikje' },{ t:'fles', g:500, l:'flesje' },{ t:'ml', g:100 }],                      // Frisdrank
  17: [{ t:'handje', g:25, l:'handje' },{ t:'gram', g:100 }],                 // Noten
  18: [{ t:'opscheplepel', g:50, l:'opscheplepel' },{ t:'gram', g:100 }],     // Peulvruchten
  19: [{ t:'portie', g:350, l:'portie' },{ t:'gram', g:100 }],                // Gerechten
  20: [{ t:'kom', g:250, l:'kom' },{ t:'ml', g:100 }],                        // Soep
  21: [{ t:'theelepel', g:5, l:'theelepel' },{ t:'gram', g:100 }],            // Suiker/snoep
  22: [{ t:'eetlepel', g:10, l:'eetlepel' },{ t:'gram', g:100 }],             // Olie/vet
  23: [{ t:'portie', g:125, l:'portie' },{ t:'gram', g:100 }],                // Vis
  24: [{ t:'portie', g:100, l:'portie' },{ t:'gram', g:100 }],                // Vlees
  25: [{ t:'portie', g:100, l:'portie' },{ t:'gram', g:100 }],                // Vleesvervangers
  26: [{ t:'plak', g:15, l:'plak' },{ t:'gram', g:100 }],                     // Vleeswaren
};

// Product-specifieke overrides (regex → porties array)
export const PRODUCT_PORTIES = [
  // ═══ FRUIT ═══
  [/\bbanaan/i,        [{ t:'stuk', g:120, l:'banaan' },{ t:'half', g:60, l:'halve' },{ t:'gram', g:100 }]],
  [/\bappel\b/i,      [{ t:'klein', g:85, l:'kleine' },{ t:'stuk', g:150, l:'appel' },{ t:'groot', g:180, l:'grote' },{ t:'gram', g:100 }]],
  [/\bpeer\b/i,       [{ t:'stuk', g:160, l:'peer' },{ t:'klein', g:100, l:'kleine' },{ t:'gram', g:100 }]],
  [/\bsinaasappel/i,   [{ t:'stuk', g:150, l:'sinaasappel' },{ t:'gram', g:100 }]],
  [/\bmandarijn/i,     [{ t:'stuk', g:70, l:'mandarijn' },{ t:'gram', g:100 }]],
  [/\bkiwi/i,          [{ t:'stuk', g:75, l:'kiwi' },{ t:'gram', g:100 }]],
  [/\bperzik/i,        [{ t:'stuk', g:120, l:'perzik' },{ t:'gram', g:100 }]],
  [/\bnectarine/i,     [{ t:'stuk', g:120, l:'nectarine' },{ t:'gram', g:100 }]],
  [/\bpruim\b/i,      [{ t:'stuk', g:55, l:'pruim' },{ t:'gram', g:100 }]],
  [/\bavocado/i,       [{ t:'stuk', g:140, l:'avocado' },{ t:'half', g:70, l:'halve' },{ t:'gram', g:100 }]],
  [/\bmango\b/i,      [{ t:'stuk', g:250, l:'mango' },{ t:'half', g:125, l:'halve' },{ t:'gram', g:100 }]],
  [/\baardbei/i,       [{ t:'stuk', g:12, l:'aardbei' },{ t:'bakje', g:250, l:'bakje' },{ t:'handje', g:80, l:'handje' },{ t:'gram', g:100 }]],
  [/\bframboos|\bframbozen/i, [{ t:'bakje', g:125, l:'bakje' },{ t:'handje', g:60, l:'handje' },{ t:'gram', g:100 }]],
  [/\bbosbes|\bblauwe\s*bes/i, [{ t:'bakje', g:125, l:'bakje' },{ t:'handje', g:60, l:'handje' },{ t:'gram', g:100 }]],
  [/\bdruif|\bdruiven/i, [{ t:'tros', g:150, l:'trosje' },{ t:'handje', g:80, l:'handje' },{ t:'gram', g:100 }]],
  [/\bwatermeloen/i,   [{ t:'plak', g:200, l:'plak' },{ t:'gram', g:100 }]],
  [/\bmeloen\b/i,     [{ t:'plak', g:150, l:'plak' },{ t:'gram', g:100 }]],
  [/\bananas/i,        [{ t:'stuk', g:120, l:'ananas (ring)' },{ t:'gram', g:100 }]],
  [/\bgrapefruit/i,    [{ t:'stuk', g:200, l:'grapefruit' },{ t:'half', g:100, l:'halve' },{ t:'gram', g:100 }]],
  [/\bcherry.*tomaat|\btomaat.*cherry|\bsnoeptomat/i, [{ t:'handje', g:75, l:'handje' },{ t:'stuk', g:15, l:'tomaatje' },{ t:'gram', g:100 }]],
  [/\btomaat\b|\btomaten\b/i, [{ t:'stuk', g:100, l:'tomaat' },{ t:'klein', g:60, l:'kleine' },{ t:'gram', g:100 }]],

  // ═══ GROENTE ═══
  [/\bwortel\b/i,     [{ t:'stuk', g:80, l:'wortel' },{ t:'groot', g:120, l:'grote' },{ t:'gram', g:100 }]],
  [/\bkomkommer/i,     [{ t:'stuk', g:400, l:'komkommer' },{ t:'kwart', g:100, l:'kwart' },{ t:'gram', g:100 }]],
  [/\bpaprika\b/i,    [{ t:'stuk', g:160, l:'paprika' },{ t:'gram', g:100 }]],
  [/\bui\b|\buien\b/i, [{ t:'stuk', g:100, l:'ui' },{ t:'klein', g:60, l:'kleine' },{ t:'gram', g:100 }]],
  [/\bcourgette/i,     [{ t:'stuk', g:200, l:'courgette' },{ t:'gram', g:100 }]],
  [/\bchampignon/i,    [{ t:'stuk', g:15, l:'champignon' },{ t:'handje', g:60, l:'handje' },{ t:'gram', g:100 }]],
  [/\bbroccoli/i,      [{ t:'portie', g:150, l:'portie' },{ t:'roosje', g:10, l:'roosje' },{ t:'gram', g:100 }]],
  [/\bbloemkool/i,     [{ t:'portie', g:150, l:'portie' },{ t:'roosje', g:20, l:'roosje' },{ t:'gram', g:100 }]],
  [/\bspinazie/i,      [{ t:'portie', g:150, l:'portie (gekookt)' },{ t:'handje', g:30, l:'handje (rauw)' },{ t:'gram', g:100 }]],
  [/\bsla\b|\bsalade/i, [{ t:'portie', g:50, l:'portie' },{ t:'gram', g:100 }]],
  [/\bprei\b/i,       [{ t:'stuk', g:200, l:'prei' },{ t:'gram', g:100 }]],
  [/\baubergine/i,     [{ t:'stuk', g:250, l:'aubergine' },{ t:'gram', g:100 }]],
  [/\bknolselderij/i,  [{ t:'stuk', g:500, l:'knolselderij' },{ t:'gram', g:100 }]],
  [/\bsperzieboon|\bsperziebonen/i, [{ t:'portie', g:150, l:'portie' },{ t:'gram', g:100 }]],
  [/\bmaïs\b|\bmais\b/i, [{ t:'kolf', g:200, l:'kolf' },{ t:'opscheplepel', g:50, l:'opscheplepel' },{ t:'gram', g:100 }]],

  // ═══ BROOD & BAKKERIJ ═══
  [/\bboterham|\bbrood\b/i, [{ t:'snee', g:35, l:'snee' },{ t:'dun', g:25, l:'dunne snee' },{ t:'dik', g:45, l:'dikke snee' },{ t:'gram', g:100 }]],
  [/\bcroissant/i,     [{ t:'stuk', g:60, l:'croissant' },{ t:'mini', g:25, l:'mini' },{ t:'gram', g:100 }]],
  [/\bbeschuit/i,      [{ t:'stuk', g:10, l:'beschuit' },{ t:'gram', g:100 }]],
  [/\bcracker/i,       [{ t:'stuk', g:10, l:'cracker' },{ t:'gram', g:100 }]],
  [/\brijstwafel/i,    [{ t:'stuk', g:8, l:'rijstwafel' },{ t:'gram', g:100 }]],
  [/\bwrap\b/i,       [{ t:'stuk', g:60, l:'wrap' },{ t:'gram', g:100 }]],
  [/\btortilla/i,      [{ t:'stuk', g:60, l:'tortilla' },{ t:'gram', g:100 }]],
  [/\bpistolet|\bbroodje/i, [{ t:'stuk', g:50, l:'broodje' },{ t:'gram', g:100 }]],
  [/\bstokbrood/i,     [{ t:'stuk', g:250, l:'stokbrood' },{ t:'half', g:125, l:'half' },{ t:'gram', g:100 }]],
  [/\bpita\b/i,       [{ t:'stuk', g:60, l:'pitabroodje' },{ t:'gram', g:100 }]],
  [/\btoast/i,         [{ t:'snee', g:25, l:'toast' },{ t:'gram', g:100 }]],
  [/\bbagel/i,         [{ t:'stuk', g:90, l:'bagel' },{ t:'gram', g:100 }]],

  // ═══ EIEREN ═══
  [/\bei\b|\beier/i,  [{ t:'S', g:40, l:'ei (S)' },{ t:'M', g:50, l:'ei (M)' },{ t:'L', g:60, l:'ei (L)' },{ t:'gram', g:100 }]],

  // ═══ ZUIVEL ═══
  [/\byoghurt/i,       [{ t:'portie', g:150, l:'bakje' },{ t:'schaaltje', g:200, l:'schaaltje' },{ t:'gram', g:100 }]],
  [/\bmelk\b/i,       [{ t:'glas', g:200, l:'glas' },{ t:'kopje', g:150, l:'kopje' },{ t:'ml', g:100 }]],
  [/\bkwark/i,         [{ t:'portie', g:150, l:'bakje' },{ t:'gram', g:100 }]],
  [/\bkaas\b/i,       [{ t:'plak', g:20, l:'plak' },{ t:'blok', g:30, l:'blokje' },{ t:'gram', g:100 }]],

  // ═══ VLEES & VIS ═══
  [/\bkipfilet/i,      [{ t:'stuk', g:150, l:'kipfilet' },{ t:'gram', g:100 }]],
  [/\bgehaktbal/i,     [{ t:'stuk', g:50, l:'gehaktbal' },{ t:'gram', g:100 }]],
  [/\bfrikandel/i,     [{ t:'stuk', g:70, l:'frikandel' },{ t:'gram', g:100 }]],
  [/\bkroket/i,        [{ t:'stuk', g:65, l:'kroket' },{ t:'gram', g:100 }]],
  [/\bloempia/i,       [{ t:'stuk', g:150, l:'loempia' },{ t:'mini', g:30, l:'mini loempia' },{ t:'gram', g:100 }]],
  [/\bpannenkoek/i,    [{ t:'stuk', g:75, l:'pannenkoek' },{ t:'gram', g:100 }]],
  [/\bgehakt\b/i,     [{ t:'portie', g:100, l:'portie' },{ t:'gram', g:100 }]],
  [/\bzalm\b/i,       [{ t:'portie', g:125, l:'portie' },{ t:'gram', g:100 }]],
  [/\bkabeljauw|\bvis\b/i, [{ t:'portie', g:125, l:'portie' },{ t:'gram', g:100 }]],
  [/\bgarnaal|\bgarnalen/i, [{ t:'portie', g:100, l:'portie' },{ t:'handje', g:40, l:'handje' },{ t:'gram', g:100 }]],
  [/\bworstje|\bworst\b/i, [{ t:'stuk', g:75, l:'worstje' },{ t:'gram', g:100 }]],

  // ═══ VLEESWAREN ═══
  [/\bham\b/i,        [{ t:'plak', g:15, l:'plak' },{ t:'gram', g:100 }]],
  [/\bsalami/i,        [{ t:'plak', g:8, l:'plakje' },{ t:'gram', g:100 }]],
  [/\bkipfilet.*beleg|\bfilet.*americain/i, [{ t:'portie', g:20, l:'portie' },{ t:'gram', g:100 }]],

  // ═══ SNACKS & GEBAK ═══
  [/\bstroopwafel/i,   [{ t:'stuk', g:30, l:'stroopwafel' },{ t:'gram', g:100 }]],
  [/\bbitterbal/i,     [{ t:'stuk', g:25, l:'bitterbal' },{ t:'gram', g:100 }]],
  [/\bkoekje/i,        [{ t:'stuk', g:15, l:'koekje' },{ t:'gram', g:100 }]],
  [/\bcake\b/i,       [{ t:'plak', g:40, l:'plak' },{ t:'gram', g:100 }]],
  [/\bchips\b/i,      [{ t:'handje', g:25, l:'handje' },{ t:'zak', g:40, l:'zakje' },{ t:'gram', g:100 }]],
  [/\bchocolade|\bchocola/i, [{ t:'reep', g:20, l:'reepje' },{ t:'tablet', g:100, l:'tablet' },{ t:'gram', g:100 }]],
  [/\btompouce/i,      [{ t:'stuk', g:80, l:'tompouce' },{ t:'gram', g:100 }]],

  // ═══ NOTEN & ZADEN ═══
  [/\bamandel/i,       [{ t:'handje', g:25, l:'handje' },{ t:'gram', g:100 }]],
  [/\bcashew/i,        [{ t:'handje', g:25, l:'handje' },{ t:'gram', g:100 }]],
  [/\bwalnoot|\bwalnoten/i, [{ t:'handje', g:25, l:'handje' },{ t:'stuk', g:5, l:'walnoot' },{ t:'gram', g:100 }]],
  [/\bpinda/i,         [{ t:'handje', g:25, l:'handje' },{ t:'gram', g:100 }]],
  [/\bnoten\b|\bnotenmix/i, [{ t:'handje', g:25, l:'handje' },{ t:'gram', g:100 }]],
  [/\bpompoenpit|\bzonnebloempit/i, [{ t:'eetlepel', g:10, l:'eetlepel' },{ t:'gram', g:100 }]],

  // ═══ DRANKEN ═══
  [/\bkoffie/i,        [{ t:'kopje', g:125, l:'kopje' },{ t:'mok', g:200, l:'mok' },{ t:'ml', g:100 }]],
  [/\bthee\b/i,       [{ t:'kopje', g:150, l:'kopje' },{ t:'mok', g:250, l:'mok' },{ t:'ml', g:100 }]],
  [/\bjus\b|\bsap\b/i, [{ t:'glas', g:200, l:'glas' },{ t:'pak', g:250, l:'pakje' },{ t:'ml', g:100 }]],
  [/\bbier\b/i,       [{ t:'glas', g:250, l:'glas' },{ t:'fles', g:330, l:'flesje' },{ t:'blik', g:330, l:'blikje' },{ t:'pint', g:500, l:'pint' },{ t:'ml', g:100 }]],
  [/\bwijn\b/i,       [{ t:'glas', g:125, l:'glas' },{ t:'fles', g:750, l:'fles' },{ t:'ml', g:100 }]],
  [/\bwater\b/i,      [{ t:'glas', g:250, l:'glas' },{ t:'fles', g:500, l:'flesje' },{ t:'ml', g:100 }]],
  [/\bcola\b|\bpepsi|\bfanta|\bsprite|\bfrisdrank|\bsinas/i, [{ t:'glas', g:200, l:'glas' },{ t:'blik', g:330, l:'blikje' },{ t:'fles', g:500, l:'flesje' },{ t:'ml', g:100 }]],
  [/\bsmoothie/i,      [{ t:'glas', g:250, l:'glas' },{ t:'fles', g:330, l:'flesje' },{ t:'ml', g:100 }]],
  [/\bchocolademelk|\bchocomel/i, [{ t:'glas', g:200, l:'glas' },{ t:'pak', g:250, l:'pakje' },{ t:'ml', g:100 }]],
  [/\benergy|\bredbull|\bmonster/i, [{ t:'blik', g:250, l:'blikje' },{ t:'ml', g:100 }]],

  // ═══ BELEG & SAUZEN ═══
  [/\bpindakaas/i,     [{ t:'eetlepel', g:15, l:'eetlepel' },{ t:'gram', g:100 }]],
  [/\bboter\b/i,      [{ t:'klontje', g:7, l:'klontje' },{ t:'gram', g:100 }]],
  [/\bmargarine|\bhalfarine/i, [{ t:'klontje', g:7, l:'klontje' },{ t:'gram', g:100 }]],
  [/\bjam\b|\bmarmelade/i, [{ t:'eetlepel', g:15, l:'eetlepel' },{ t:'gram', g:100 }]],
  [/\bhagel/i,         [{ t:'eetlepel', g:10, l:'eetlepel' },{ t:'gram', g:100 }]],
  [/\bhummus/i,        [{ t:'eetlepel', g:20, l:'eetlepel' },{ t:'gram', g:100 }]],
  [/\bmayonaise|\bmayo/i, [{ t:'eetlepel', g:15, l:'eetlepel' },{ t:'gram', g:100 }]],
  [/\bketchup/i,       [{ t:'eetlepel', g:15, l:'eetlepel' },{ t:'gram', g:100 }]],
  [/\bmosterd/i,       [{ t:'theelepel', g:5, l:'theelepel' },{ t:'gram', g:100 }]],
  [/\bsojasaus/i,      [{ t:'eetlepel', g:15, l:'eetlepel' },{ t:'gram', g:100 }]],
  [/\bolijfolie|\bolie\b/i, [{ t:'eetlepel', g:10, l:'eetlepel' },{ t:'gram', g:100 }]],

  // ═══ GRAAN & PASTA ═══
  [/\brijst\b/i,      [{ t:'portie', g:75, l:'portie (droog)' },{ t:'opscheplepel', g:50, l:'opscheplepel (gekookt)' },{ t:'gram', g:100 }]],
  [/\bpasta\b|\bspaghetti|\bmacaroni|\bpenne|\bfusilli|\btaglia/i, [{ t:'portie', g:85, l:'portie (droog)' },{ t:'gram', g:100 }]],
  [/\bhavermout|\boatmeal/i, [{ t:'portie', g:40, l:'portie' },{ t:'eetlepel', g:10, l:'eetlepel' },{ t:'gram', g:100 }]],
  [/\bgranola|\bmuesli/i, [{ t:'portie', g:40, l:'portie' },{ t:'gram', g:100 }]],
  [/\bcouscous/i,      [{ t:'portie', g:60, l:'portie (droog)' },{ t:'gram', g:100 }]],
  [/\bquinoa/i,        [{ t:'portie', g:60, l:'portie (droog)' },{ t:'gram', g:100 }]],

  // ═══ PEULVRUCHTEN ═══
  [/\blinzen/i,        [{ t:'portie', g:60, l:'portie (droog)' },{ t:'opscheplepel', g:50, l:'opscheplepel' },{ t:'gram', g:100 }]],
  [/\bkikkererwt/i,    [{ t:'portie', g:60, l:'portie (droog)' },{ t:'opscheplepel', g:50, l:'opscheplepel' },{ t:'gram', g:100 }]],
  [/\bbonen\b/i,      [{ t:'opscheplepel', g:50, l:'opscheplepel' },{ t:'gram', g:100 }]],

  // ═══ AARDAPPELEN ═══
  [/\baardappel/i,     [{ t:'stuk', g:100, l:'aardappel' },{ t:'portie', g:200, l:'portie' },{ t:'gram', g:100 }]],
  [/\bzoete\s*aardappel|\bsüßkartoffel|\bbataat/i, [{ t:'stuk', g:200, l:'zoete aardappel' },{ t:'gram', g:100 }]],
  [/\bfrieten|\bfriet\b|\bpatat/i, [{ t:'portie', g:150, l:'portie' },{ t:'groot', g:250, l:'grote portie' },{ t:'gram', g:100 }]],

  // ═══ SUIKER & ZOET ═══
  [/\bsuiker/i,        [{ t:'theelepel', g:5, l:'theelepel' },{ t:'klontje', g:4, l:'klontje' },{ t:'gram', g:100 }]],
  [/\bhoning/i,        [{ t:'theelepel', g:8, l:'theelepel' },{ t:'eetlepel', g:20, l:'eetlepel' },{ t:'gram', g:100 }]],
];

// Find portion options for a product
export function findPortie(productName, groepId, servingGrams) {
  const name = productName || '';
  const result = [];

  // 0) If product has serving size from OFF data, add it first
  if (servingGrams && servingGrams > 0 && servingGrams < 2000) {
    result.push({ t:'portie', g: servingGrams, l: 'verpakking (' + servingGrams + 'g)' });
  }

  // 1) Product-specifieke match (regex, word boundary)
  for (const [pattern, porties] of PRODUCT_PORTIES) {
    if (pattern.test(name)) {
      result.push(...porties.filter(p => p.g !== servingGrams)); // avoid duplicate
      return result.length ? result : porties;
    }
  }

  // 2) Groep-gebaseerde portie
  if (groepId !== undefined && GROEP_PORTIES[groepId]) {
    result.push(...GROEP_PORTIES[groepId].filter(p => p.g !== servingGrams));
    return result;
  }

  // 3) Fallback
  result.push({ t:'gram', g:100, l:'100g' });
  return result;
}

// Parse quantity expressions: "2 bananen", "handje noten", "halve avocado"
export function parseQuantity(query) {
  const q = query.toLowerCase().trim();
  let count = 1;
  let unit = null;
  let rest = q;

  const numMatch = q.match(/^(\d+(?:[.,]\d+)?)\s+(.+)/);
  const halfMatch = q.match(/^(?:halve?|half)\s+(.+)/);
  const handjeMatch = q.match(/^(?:handje|handvol)\s+(.+)/);
  const kopjeMatch = q.match(/^(?:kopje)\s+(.+)/);
  const glasMatch = q.match(/^(?:glas(?:je)?)\s+(.+)/);

  if (numMatch) {
    count = parseFloat(numMatch[1].replace(',', '.'));
    rest = numMatch[2];
  } else if (halfMatch) {
    count = 0.5;
    rest = halfMatch[1];
  } else if (handjeMatch) {
    unit = 'handje';
    rest = handjeMatch[1];
  } else if (kopjeMatch) {
    unit = 'kopje';
    rest = kopjeMatch[1];
  } else if (glasMatch) {
    unit = 'glas';
    rest = glasMatch[1];
  }

  // "appel 2 stuks" of "3 stuks"
  const stuksEnd = rest.match(/(.+?)\s+(\d+)\s*(?:stuks?|st)$/);
  if (stuksEnd) {
    rest = stuksEnd[1];
    count = parseFloat(stuksEnd[2]);
  }
  rest = rest.replace(/\s+(?:stuks?|st)$/i, '').trim();

  return { count, unit, query: rest };
}
