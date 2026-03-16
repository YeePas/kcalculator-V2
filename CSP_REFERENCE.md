# Content Security Policy (CSP) Quick Reference for kcalculator.eu

## 🎯 Your Safe Default CSP (Copy-Paste Ready)

```
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://world.openfoodfacts.org https://api.supabase.co; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests
```

---

## 🔍 What Each Directive Does

### `default-src 'none'`
- **Blocks**: Everything by default
- **Why**: Deny-first approach (whitelist mode)
- **Impact**: Most restrictive, forces explicit allow

### `script-src 'self'`
- **Allows**: Only JavaScript from same origin (kcalculator.eu)
- **Blocks**: Inline scripts, external scripts, eval()
- **Good for**: Vite bundles all JS, no external scripts needed

### `style-src 'self'`
- **Allows**: Only CSS from same origin
- **Blocks**: Inline styles, external stylesheets
- **Good for**: Vite bundles CSS, no external styles needed

### `img-src 'self' data: https:`
- **Allows**: 
  - Images from same origin (app images)
  - Data URLs (embedded images)
  - HTTPS external images (OpenFoodFacts)
- **Blocks**: HTTP images (unsafe)

### `font-src 'self'`
- **Allows**: Only fonts from same origin
- **Blocks**: Google Fonts, external CDN fonts
- **Good for**: Bundle fonts locally with Vite

### `connect-src 'self' https://world.openfoodfacts.org https://api.supabase.co`
- **Allows**:
  - API calls to own domain (webhooks, auth)
  - OpenFoodFacts API (food search): `https://world.openfoodfacts.org/cgi/search.pl`
  - Supabase API (auth, database): `https://api.supabase.co`
- **Blocks**: WebSocket connections not in whitelist
- **Critical for**: Your app functionality

### `frame-ancestors 'none'`
- **Prevents**: Embedding in iframe on other sites
- **Blocks**: Clickjacking attacks
- **Equivalent to**: `X-Frame-Options: DENY`

### `base-uri 'self'`
- **Prevents**: Changing base URL via `<base>` tag
- **Blocks**: JavaScript hijacking

### `object-src 'none'`
- **Blocks**: Flash, plugins, object embeds
- **Good for**: Modern web apps (no plugins needed)

### `form-action 'self'`
- **Allows**: Form submissions only to same origin
- **Blocks**: Form hijacking to external sites

### `upgrade-insecure-requests`
- **Action**: Automatically upgrade HTTP → HTTPS requests
- **Security**: Protects against downgrade attacks

---

## 📋 Testing Your CSP

### 1. Check Current CSP
```bash
# See what CSP is currently set
curl -I https://kcalculator.eu | grep -i "content-security-policy"

# Should output your CSP header
```

### 2. Test with Report-Only (No Blocking)
```
Content-Security-Policy-Report-Only: default-src 'none'; ...
```
This logs violations to console but doesn't block resources.

### 3. Check Console for Violations
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for red messages like:
   ```
   Content Security Policy: Refused to load...
   ```

### 4. Add Domains When Needed
If you see violations:
```
Refused to load 'https://some-api.com/...'
```

Add to CSP:
```
connect-src 'self' https://world.openfoodfacts.org https://api.supabase.co https://some-api.com;
```

---

## 🚀 Deployment: Copy-Paste CSP for Each Platform

### ✂️ Nginx
```nginx
add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://world.openfoodfacts.org https://api.supabase.co; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests" always;
```

### ✂️ Netlify (netlify.toml)
```toml
[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://world.openfoodfacts.org https://api.supabase.co; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests"
```

### ✂️ Vercel (vercel.json)
```json
{
  "key": "Content-Security-Policy",
  "value": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://world.openfoodfacts.org https://api.supabase.co; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests"
}
```

### ✂️ Express.js (server.js)
```javascript
{
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", 'https://world.openfoodfacts.org', 'https://api.supabase.co'],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  }
}
```

---

## 🚨 Common CSP Issues & Fixes

### Issue: App doesn't load styles
```
Refused to load stylesheet 'https://...'
```
**Fix**: Ensure Vite bundles CSS properly
```bash
npm run build
# Check that dist/ contains app.*.css
```

### Issue: External image blocked
```
Refused to load image 'https://example.com/image.jpg'
```
**Fix**: Add domain to img-src
```
img-src 'self' data: https: https://example.com;
```

### Issue: Font not loading
```
Refused to load font from '...'
```
**Fix**: Either bundle fonts or add to font-src
```
font-src 'self' https://fonts.googleapis.com;
```

### Issue: OpenFoodFacts API blocked
```
Refused to connect to 'https://world.openfoodfacts.org/cgi/search.pl'
```
**Fix**: Already in default CSP, check URL is correct
```
connect-src 'self' https://world.openfoodfacts.org;
```

### Issue: Supabase not connecting
```
Refused to connect to 'https://api.supabase.co'
```
**Fix**: Already in default CSP, check your Supabase URL
```
connect-src 'self' https://api.supabase.co;
```

---

## 📊 CSP Monitoring

### Enable CSP Report Collection
For production monitoring, add report-uri:
```
Content-Security-Policy: ...; report-uri https://your-report-endpoint.com/csp
```

**Free options**:
- Report.uri (free tier): https://report.uri.com
- Bugsnag: https://bugsnag.com/ (free tier)
- Sentry: https://sentry.io/ (free tier)

### Parse CSP Reports
Example CSP violation report:
```json
{
  "csp-report": {
    "document-uri": "https://kcalculator.eu",
    "violated-directive": "connect-src",
    "effective-directive": "connect-src",
    "original-policy": "default-src 'none'; ...",
    "blocked-uri": "https://unknown-api.com",
    "status-code": 0
  }
}
```

---

## ✅ Verification Checklist

After deploying CSP:

- [ ] App loads without errors in console
- [ ] Can search OpenFoodFacts (API works)
- [ ] Can login to Supabase (auth works)
- [ ] Can save favorites (database works)
- [ ] Can upload photos (if applicable)
- [ ] No CSP violations in DevTools Console
- [ ] Run SecurityHeaders.com scan
- [ ] All macros display correctly
- [ ] Mobile version works
- [ ] Dark mode works

---

## 🎓 CSP Policy Explanation Example

When a user visits kcalculator.eu:

1. **Page loads** → Browser downloads `index.html`
2. **Script loads** → Browser checks CSP
   - Is script from `kcalculator.eu`? ✓ **ALLOWED** (script-src 'self')
   - Is script inline? ✗ **BLOCKED**
   - Is script from external CDN? ✗ **BLOCKED**
3. **CSS loads** → Browser checks CSP
   - Is CSS from `kcalculator.eu`? ✓ **ALLOWED** (style-src 'self')
4. **Food image loads** → Browser checks CSP
   - Is image from OpenFoodFacts? ✓ **ALLOWED** (img-src https:)
5. **API call** → Browser checks CSP
   - Is request to `world.openfoodfacts.org`? ✓ **ALLOWED** (connect-src)
   - Is request to `api.supabase.co`? ✓ **ALLOWED** (connect-src)
6. **Attacker tries to inject script** → Browser blocks:
   ```javascript
   <script src="https://attacker.com/steal-cookies.js"></script>
   // ✗ BLOCKED: Not in script-src whitelist
   ```

---

## 📌 Quick Reference Card

| Directive | Purpose | Allowed |
|-----------|---------|---------|
| `default-src` | Fallback for others | `'none'` (deny all) |
| `script-src` | JavaScript | `'self'` only |
| `style-src` | CSS | `'self'` only |
| `img-src` | Images | `'self' data: https:` |
| `font-src` | Fonts | `'self'` only |
| `connect-src` | Network requests | `'self' + API URLs` |
| `frame-ancestors` | Iframe embedding | `'none'` (no iframe) |
| `object-src` | Plugins/Flash | `'none'` (no plugins) |
| `base-uri` | Base URL | `'self'` only |
| `form-action` | Form submission | `'self'` only |

---

**Status**: ✅ Ready to deploy  
**Last Updated**: 2026-03-16  
**Target**: A+ on SecurityHeaders.com
