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

## Deploy naar Supabase via GitHub Actions

Deze repo bevat ook een workflow in [.github/workflows/deploy-supabase.yml](/Users/joepwillemsen/Documents/GitHub/kcalculator-V2/.github/workflows/deploy-supabase.yml).

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
