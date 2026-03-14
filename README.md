# Kcalculator

Slimme voedingstracker met Nederlandse productdata, lokale opslag, optionele Supabase-sync en AI-ondersteunde import.

## Wat zit erin

- Dagboek voor maaltijden, snacks en drinken
- Favorieten en eigen producten
- Dashboard, weekrapport en inzichten
- PWA met service worker en installatiemogelijkheid
- Optionele sync via Supabase
- Optionele AI-import via Claude, Gemini of OpenAI

## Stack

- Vite
- Vanilla JavaScript
- GitHub Pages voor static hosting
- Supabase voor auth en sync

## Lokale ontwikkeling

```bash
npm ci
npm run dev
```

## Productie-build

```bash
npm run test:run
npm run build
```

De productiebuild komt in `dist/`.

## Deploy naar GitHub Pages

Deze repo bevat een workflow in [.github/workflows/deploy-pages.yml](/Users/joepwillemsen/Documents/GitHub/kcalculator/.github/workflows/deploy-pages.yml) die deployt bij pushes naar `main`.

Voor GitHub Pages moet je in GitHub nog even controleren:

1. `Settings -> Pages`
2. `Source` op `GitHub Actions`
3. Custom domain op `kcalculator.eu`
4. DNS-records van `kcalculator.eu` correct naar GitHub Pages

Het custom domain bestand staat in [public/CNAME](/Users/joepwillemsen/Documents/GitHub/kcalculator/public/CNAME).

## Omgevingsvariabelen

Optioneel kun je tijdens build/deploy deze variabelen meegeven:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Zonder deze variabelen werkt de app lokaal/offline nog steeds, maar niet met Supabase-sync tenzij een gebruiker die handmatig invult.

## URL-import proxy via Supabase

Voor betrouwbare URL-import van retailerpagina's zoals `ah.nl` en `jumbo.com` is er een Supabase Edge Function toegevoegd:

- `supabase/functions/url-import-proxy`

Deployen kan met de Supabase CLI:

```bash
supabase functions deploy url-import-proxy
```

Daarna gebruikt de app automatisch deze proxy via je bestaande:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Zonder deze function blijft URL-import werken, maar retailerpagina's kunnen dan terugvallen op een schatting omdat browsers zulke pagina's vaak niet direct mogen uitlezen.

## Belangrijke noot

AI-verkeer draait nu nog client-side. Voor privégebruik is dat werkbaar, maar voor een publieke productie-app is een backend of edge function veiliger zodat gebruikers-API-keys niet in de browser blijven.
