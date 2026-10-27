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

Deze repo bevat een workflow in [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) die deployt bij pushes naar `main`.

Voor GitHub Pages moet je in GitHub nog even controleren:

1. `Settings -> Pages`
2. `Source` op `GitHub Actions`
3. Custom domain op `kcalculator.eu`
4. DNS-records van `kcalculator.eu` correct naar GitHub Pages

Het custom domain bestand staat in [public/CNAME](public/CNAME).

## Deploy naar Supabase via GitHub Actions

Deze repo bevat ook een workflow in [.github/workflows/deploy-supabase.yml](.github/workflows/deploy-supabase.yml).

Die doet automatisch:

- database migrations pushen
- `ai-proxy` deployen
- `save-user-ai-key` deployen
- `url-import-proxy` deployen

Je hoeft daarvoor geen lokale Supabase te draaien. Wel moet je in GitHub eenmalig deze repository secrets instellen:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`

Waar vind je die?

- `SUPABASE_PROJECT_REF`: in je Supabase project URL of project settings
- `SUPABASE_DB_PASSWORD`: het database-wachtwoord van je Supabase project
- `SUPABASE_ACCESS_TOKEN`: maak je aan in Supabase via `Account -> Access Tokens`

In GitHub:

1. Ga naar `Settings -> Secrets and variables -> Actions`
2. Kies `New repository secret`
3. Voeg de 3 secrets hierboven toe

Daarna geldt:

- push naar `main` = website deployt via GitHub Pages
- Supabase functions en migrations deployen automatisch mee via GitHub Actions

## Supabase keep-alive

Gratis Supabase-projecten worden gepauzeerd als Supabase geen activiteit ziet. Een leesverzoek via de REST-API bleek niet genoeg (in oktober 2026 binnen 4 dagen na een ping gepauzeerd). De workflow [.github/workflows/supabase-keepalive.yml](.github/workflows/supabase-keepalive.yml) draait daarom dagelijks en:

1. controleert de projectstatus via de Supabase Management API;
2. zet het project terug aan als het toch gepauzeerd is, en wacht tot het weer draait;
3. voert een echte query uit op de database (`select now()`) en doet daarnaast een REST-verzoek.

Hij gebruikt de secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY`. Handmatig starten kan via de Actions-tab.

## Productdatabase onderhouden

`public/products.json` bevat de NEVO-tabel (RIVM) en Nederlandse producten uit OpenFoodFacts. Na elke wijziging aan dat bestand:

```bash
node scripts/validate_products.mjs
```

Dat script:

- rekent kJ die in het kcal-veld staat om naar kcal, en vergelijkt kcal met de macro's (4 kcal/g koolhydraten en eiwit, 9 vet, 2 vezel). Twijfelgevallen krijgen `w: 1` en tonen een waarschuwing in de app. Alcohol en suikervrije producten zijn uitgezonderd.
- verwijdert producten met onmogelijke waarden (bijv. meer dan 100 g macro per 100 g).
- past de handmatige correcties uit `data/product-corrections.json` toe, zodat die een nieuwe opbouw van de database overleven.
- zet een `version`. De app downloadt de database opnieuw zodra die versie verandert.

De deploy draait `node scripts/validate_products.mjs --check` en stopt als het bestand niet is genormaliseerd.

**Maandelijks opnieuw opbouwen:** de workflow [rebuild-products.yml](.github/workflows/rebuild-products.yml) downloadt elke eerste van de maand de Open Food Facts-export, bouwt met `scripts/build_products.py` een nieuwe `products.json` (NEVO uit `data/nevo-2025.json` plus de Nederlandse producten van Open Food Facts, met streepjescode, suiker, verzadigd vet en zout), valideert die en zet hem klaar als pull request met een rapport. Pas na het mergen gaat hij live. Handmatig starten kan via de Actions-tab ("Run workflow").

Voor automatische pull requests moet in GitHub aan staan: *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests*. Staat dat uit, dan zet de workflow een link naar de branch in de samenvatting van de run.

**Nieuwe NEVO-versie:** download de dataset via [NEVO-online](https://www.rivm.nl/nederlands-voedingsstoffenbestand) (je gaat dan akkoord met de gebruiksvoorwaarden) en draai `python3 scripts/build_nevo.py pad/naar/NEVO….csv data/nevo-2025.json`. NEVO-gegevens worden ongewijzigd overgenomen, met bronvermelding; het controlescript laat NEVO-producten met rust. Het script zet de NEVO-groepen op alfabetische volgorde: de standaardporties per groep (`GROEP_PORTIES` in `src/products/portions.js`) gebruiken die volgorde, en een test bewaakt dat.

**Fouten melden en verbeteren:** gebruikers kunnen bij elk product op "Klopt niet?" tikken. In de beheerpagina (`/admin`, tab Issues) staat bij zo'n melding een knop die een correctieregel kopieert. Plak die in `data/product-corrections.json`, pas de waarden aan naar de verpakking en draai het script. Mogelijke regels:

```json
[
  { "n": "Productnaam", "b": "Merk", "set": { "k": 250, "e": 9 }, "note": "verpakking" },
  { "n": "Productnaam", "verified": true, "note": "klopt ondanks afwijking" },
  { "n": "Productnaam", "remove": true, "note": "dubbel" },
  { "add": true, "n": "AH Mueslireep hazelnoot", "b": "Albert Heijn", "c": "8719587013007",
    "k": 367, "kh": 46, "v": 11, "e": 7.2, "vz": 24, "su": 6.8, "vv": 1.1, "zo": 0.1, "sg": 25,
    "note": "ah.nl; Open Food Facts heeft geen voedingswaarden" }
]
```

Een `add`-regel voegt een product toe dat in de bronnen ontbreekt of daar geen voedingswaarden heeft. Zodra de bron het product zelf heeft (zelfde streepjescode of naam + merk), slaat het script de toevoeging over en meldt dat de regel weg kan. Waarden per 100 g; `sg` is één portie in gram. Beter nog: vul het product ook aan op [Open Food Facts](https://world.openfoodfacts.org), zodat iedereen er iets aan heeft.

## Porties en Schijf van Vijf

- **Porties** (`src/products/portions.js`): eerst een productregel op naam (de regel die het vroegst in de naam staat wint, bij gelijkspel de langste), anders de standaardportie van de NEVO-groep, anders 100 g. Een portie van de verpakking (Open Food Facts) staat bovenaan. Maten staan van klein naar groot; de app kiest vooraf de middelste.
- **Gram of ml** (`src/products/density.js`): dranken, olie en sauzen in ml, maar wat *in* olie, water of zoetzuur zit (tonijn, augurken) in gram.
- **Schijf van Vijf** (`src/pages/schijf.js`): een gelogd item wordt gekoppeld aan een product; de NEVO-groep plus de naam bepalen de categorie. Lukt dat niet, dan wordt op hele woorden gezocht in de naam. Wit brood en witte rijst tellen niet als volkoren.

Voorbeelden van beide staan in `tests/unit/portions.test.js` en `tests/unit/schijf.test.js`; voeg daar een regel toe als je een fout vindt.

## AI-modellen

De modellen per provider staan op één plek: `PROVIDER_MODELS` in `src/constants.js`. Het eerste model is de standaard. Het instellingenscherm en de modelkeuzes lezen die lijst. Bij een nieuw model:

1. Pas `PROVIDER_MODELS` aan.
2. Zet oude modelnamen om in `normalizeStoredAiModel` (`src/storage.js`), zodat opgeslagen keuzes van gebruikers meeverhuizen.
3. Controleer in `supabase/functions/ai-proxy/index.ts` of de request-parameters nog kloppen (bijv. `max_completion_tokens` en `reasoning_effort` bij nieuwe OpenAI-modellen, `thinkingConfig` bij Gemini 3) en deploy de functie.
4. Werk de modelnamen bij in `public/handleiding.html`.

## Omgevingsvariabelen

Optioneel kun je tijdens build/deploy deze variabelen meegeven:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ALLOW_REGISTRATION`

Zonder deze variabelen werkt de app lokaal/offline nog steeds, maar niet met Supabase-sync tenzij een gebruiker die handmatig invult.

Voor `VITE_ALLOW_REGISTRATION` geldt:

- standaard is registreren uit
- zet `VITE_ALLOW_REGISTRATION=true` alleen als je openbare signup echt wilt openen

Voor GitHub Actions / GitHub Pages is een repository variable meestal het handigst:

1. `Settings -> Secrets and variables -> Actions`
2. tab `Variables`
3. voeg `VITE_ALLOW_REGISTRATION` toe
4. zet die op `false` voor handmatig accountbeheer

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

## Veilige AI-sleutels via Supabase

Deze repo ondersteunt nu een veiligere flow waarbij gebruikers hun eigen AI-sleutel in de app invullen, terwijl:

- de sleutel versleuteld in Supabase wordt opgeslagen
- de browser de ruwe sleutel niet bewaart
- alleen Edge Functions de sleutel kunnen ontsleutelen en gebruiken

Wat je hiervoor nodig hebt:

1. Draai de database migration voor `user_ai_keys`
2. Zet een encryptiesleutel in Supabase secrets
3. Deploy de Edge Functions

Voorbeeld:

Die migration en functions kunnen nu via GitHub Actions mee-deployen. Wat je nog steeds eenmalig moet doen in Supabase zelf:

- `AI_KEY_ENCRYPTION_SECRET` toevoegen bij `Project Settings -> Edge Functions -> Secrets`

Als je het toch handmatig wilt doen met de Supabase CLI:

```bash
supabase link --project-ref cykoqtzdoypqrxilqoer
supabase db push
supabase secrets set AI_KEY_ENCRYPTION_SECRET="kies-hier-een-lange-willekeurige-geheime-string"
supabase functions deploy ai-proxy --no-verify-jwt
supabase functions deploy save-user-ai-key --no-verify-jwt
```

Optioneel kun je daarnaast ook globale fallback-sleutels op serverniveau zetten:

```bash
supabase secrets set ANTHROPIC_API_KEY="..."
supabase secrets set OPENAI_API_KEY="..."
supabase secrets set GEMINI_API_KEY="..."
```

Dan geldt:

- heeft een gebruiker een eigen opgeslagen sleutel, dan gebruikt de app die
- anders valt de app terug op de globale project-sleutel als die bestaat
