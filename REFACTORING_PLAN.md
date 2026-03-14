# Kcalculator — Refactoring & Kwaliteitsplan

## 1. Huidige Status

Het project is al gerefactord van een monoliet (6800+ regels `index.html`) naar een modulaire Vite-structuur met ~20 ES-modules. Dit is een goed startpunt. Hieronder de stappen om de code verder te verbeteren.

---

## 2. Tooling Installeren

### Vereiste npm packages

```bash
# Testing framework (werkt native met Vite/ES modules)
npm install -D vitest

# DOM-simulatie voor browser-afhankelijke tests
npm install -D jsdom

# Code-kwaliteit
npm install -D eslint @eslint/js

# Optioneel: code-formatting
npm install -D prettier
```

### VS Code extensies

| Extensie | ID | Wat het doet |
|---|---|---|
| ESLint | `dbaeumer.vscode-eslint` | Linting in de editor |
| Prettier | `esbenp.prettier-vscode` | Auto-formatting |
| Vitest | `vitest.explorer` | Test runner in VS Code |

### npm scripts toevoegen aan `package.json`

```json
{
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/"
  }
}
```

---

## 3. Refactoring Prioriteiten

### Ronde 1: Puur logica scheiden van DOM

**Probleem**: Veel functies mengen berekeningen met `document.getElementById()`.

**Aanpak**: Trek pure functies eruit die _geen_ DOM aanraken. Die zijn makkelijk te testen.

| Module | Pure logica om te extraheren |
|---|---|
| `utils.js` | ✅ Al grotendeels puur (`dateKey`, `dayTotals`, `esc`, `r1`, `pct`) |
| `storage.js` | ✅ Al puur (localStorage wrappers) |
| `products/matcher.js` | Parsing-logica (regex, portie-berekening) → puur |
| `products/portions.js` | `findPortie()`, `PRODUCT_PORTIES` → puur |
| `ai/parser.js` | Prompt-constructie → puur; API-call → apart |
| `supabase/sync.js` | Mapping-functies → puur; fetch-calls → apart |

**Patroon**:
```js
// VOOR (gemixed)
export function renderSummary(day) {
  const { cals } = dayTotals(day);          // ← pure logica
  document.getElementById('total-cals')     // ← DOM
    .textContent = Math.round(cals);
}

// NA (gescheiden)
// utils.js — pure, testbaar
export function calcSummary(day, goals) {
  const { cals, carbs, fat, prot } = dayTotals(day);
  return { cals: Math.round(cals), pctCals: pct(cals, goals.kcal), ... };
}

// ui/render.js — DOM-laag
export function renderSummary(day) {
  const data = calcSummary(day, goals);
  document.getElementById('total-cals').textContent = data.cals;
}
```

### Ronde 2: State management opschonen

**Probleem**: `state.js` exporteert `let`-variabelen met losse setter-functies. Dit maakt het lastig te testen en te tracken wie state wijzigt.

**Aanpak**: Maak een simpel state-object met getters/setters:

```js
// state.js
const state = {
  _cfg: {},
  get cfg() { return this._cfg; },
  set cfg(v) { this._cfg = v; },
  // ...
};
export default state;
```

Of simpeler: gebruik een `reactive` object-patroon. Dit is een latere optimalisatie.

### Ronde 3: Circulaire dependencies elimineren

**Probleem**: `main.js` importeert uit alles, en sommige modules importeren terug uit `main.js` (via dynamic import).

**Aanpak**:
1. Maak een `events.js` of `bus.js` voor cross-module communicatie
2. Of gebruik callback-registratie in plaats van directe imports
3. Gebruik `npx madge --circular src/` om circulaire deps te detecteren

### Ronde 4: TypeScript (optioneel, aanbevolen)

Voegt type-veiligheid toe zonder runtime overhead:
1. Begin met `// @ts-check` bovenaan JS-bestanden
2. Voeg JSDoc-types toe (`@param`, `@returns`)
3. Overweeg later `.ts`-bestanden (Vite ondersteunt dit native)

---

## 4. Test-strategie

### Laag 1: Unit tests (puur, snel)
- `utils.js` — alle helper-functies
- `storage.js` — localStorage wrappers
- `constants.js` — controleer dat structuur klopt
- `products/portions.js` — portie-matching
- `supabase/sync.js` — mapping-functies

### Laag 2: Integration tests (met jsdom)
- Modals openen/sluiten
- Items toevoegen/verwijderen/verplaatsen
- Favorieten CRUD
- Dag-navigatie

### Laag 3: E2E tests (toekomst)
- Playwright of Cypress
- Volledige gebruikersflows (inloggen, item toevoegen, sync)

### Naamgeving en structuur

```
tests/
  unit/
    utils.test.js          ← pure functies
    storage.test.js        ← localStorage
    portions.test.js       ← portie-matching
    sync-mapping.test.js   ← Supabase mappings
    constants.test.js      ← structuur-checks
  integration/
    day-operations.test.js ← items toevoegen/verwijderen
```

---

## 5. Volgorde van Aanpak

| Stap | Actie | Geschatte tijd |
|------|-------|----------------|
| 1 | Vitest + ESLint installeren, config aanmaken | 15 min |
| 2 | Unit tests schrijven voor `utils.js`, `storage.js` | 30 min |
| 3 | Unit tests voor `portions.js`, `sync.js` mappings | 30 min |
| 4 | ESLint configureren, `npm run lint` laten werken | 15 min |
| 5 | Pure logica extraheren uit render/UI functies | 1-2 uur |
| 6 | Integration tests met jsdom voor CRUD-operaties | 1 uur |
| 7 | CI pipeline opzetten (GitHub Actions) | 30 min |

---

## 6. Kwaliteitsregels

- **Geen `document.*` in pure logica modules** — alleen in `ui/` en `modals/`
- **Elke nieuwe functie krijgt een test** als het pure logica is
- **Max 150 regels per module** — splits als het groter wordt
- **Imports bovenaan, exports beneden** — consistent patroon
- **Nederlandse naamgeving** voor domein-termen (maaltijd, gerecht), Engels voor technische termen (render, parse, fetch)
