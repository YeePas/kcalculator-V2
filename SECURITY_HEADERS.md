# Security Headers & Configuration for kcalculator.eu

## 1. Security Headers Explained

### X-Frame-Options (Clickjacking Protection)
```
X-Frame-Options: DENY
```
- **DENY**: Prevents embedding in any frame/iframe (most secure)
- **SAMEORIGIN**: Allow only same-origin framing
- Alt: `Content-Security-Policy: frame-ancestors 'none';` (modern approach)

### X-Content-Type-Options (MIME Type Sniffing)
```
X-Content-Type-Options: nosniff
```
- Prevents browsers from guessing file types
- Essential for security

### Strict-Transport-Security (HSTS)
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```
- Forces HTTPS for 2 years (63072000 seconds)
- Prevents SSL downgrade attacks
- `preload` allows inclusion in browser HSTS preload lists

### Content-Security-Policy (CSP)
```
Content-Security-Policy: 
  default-src 'none';
  script-src 'self';
  style-src 'self';
  img-src 'self' data: https:;
  font-src 'self';
  connect-src 'self' https://world.openfoodfacts.org;
  frame-ancestors 'none';
  base-uri 'self';
  object-src 'none';
  form-action 'self'
```

### Referrer-Policy (Privacy)
```
Referrer-Policy: strict-no-referrer
```
- `strict-no-referrer`: Never send referrer info
- `no-referrer-when-downgrade`: Default, safe for HTTPS

### Permissions-Policy (Feature Control)
```
Permissions-Policy: 
  accelerometer=(),
  ambient-light-sensor=(),
  autoplay=(),
  camera=(),
  geolocation=(),
  gyroscope=(),
  magnetometer=(),
  microphone=(),
  payment=(),
  usb=()
```

---

## 2. Implementation by Hosting Platform

### A. Nginx Configuration

Create `/etc/nginx/conf.d/kcalculator-security.conf`:

```nginx
# Security Headers for kcalculator.eu
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-no-referrer" always;
add_header Permissions-Policy "accelerometer=(), ambient-light-sensor=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" always;

add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

# Content-Security-Policy (Vite static site)
add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://world.openfoodfacts.org https://api.supabase.co; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests" always;

# Server block for kcalculator.eu
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name kcalculator.eu www.kcalculator.eu;

    ssl_certificate /etc/letsencrypt/live/kcalculator.eu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kcalculator.eu/privkey.pem;

    # Modern TLS Configuration (A+ rating)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/letsencrypt/live/kcalculator.eu/chain.pem;

    root /var/www/kcalculator.eu/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;

    # SPA routing: fallback to index.html
    location / {
        try_files $uri $uri/ /index.html;
        expires 1h;
    }

    # Cache busting for versioned assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Deny access to sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~ ~$ {
        deny all;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name kcalculator.eu www.kcalculator.eu;
    return 301 https://$server_name$request_uri;
}
```

### B. Express.js / Node Server

```javascript
// server.js - Secure headers middleware for static Vite build

import express from 'express';
import helmet from 'helmet'; // npm install helmet
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Helmet provides many security headers by default
app.use(helmet({
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
  },
  strictTransportSecurity: {
    maxAge: 63072000, // 2 years
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny',
  },
  noSniff: true,
  referrerPolicy: {
    policy: 'strict-no-referrer',
  },
  permissionsPolicy: {
    accelerometer: [],
    ambientLightSensor: [],
    autoplay: [],
    camera: [],
    geolocation: [],
    gyroscope: [],
    magnetometer: [],
    microphone: [],
    payment: [],
    usb: [],
  },
}));

// Compression
app.use(compression());

// Static file serving (Vite dist)
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath, {
  maxAge: '1y', // Cache versioned assets for 1 year
  immutable: true,
}));

// SPA fallback: route all requests to index.html (except API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

Install dependencies:
```bash
npm install express helmet compression
```

### C. Netlify Configuration

Create `netlify.toml` in project root:

```toml
[build]
  publish = "dist"
  command = "npm run build"

# Security headers
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    X-XSS-Protection = "1; mode=block"
    Referrer-Policy = "strict-no-referrer"
    Strict-Transport-Security = "max-age=63072000; includeSubDomains; preload"
    Content-Security-Policy = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://world.openfoodfacts.org https://api.supabase.co; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests"
    Permissions-Policy = "accelerometer=(), ambient-light-sensor=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"

# Cache control for versioned assets
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, immutable, max-age=31536000"

# Cache control for index.html (short cache for updates)
[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "max-age=3600, must-revalidate"

# Redirect HTTP to HTTPS
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[redirects]]
  from = "https://kcalculator.eu/*"
  to = "https://www.kcalculator.eu/:splat"
  status = 301
  force = true
```

### D. Vercel Configuration

Create `vercel.json` in project root:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-no-referrer"
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'none'; script-src 'self'; style-src 'self'; img-img 'self' data: https:; font-src 'self'; connect-src 'self' https://world.openfoodfacts.org https://api.supabase.co; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests"
        },
        {
          "key": "Permissions-Policy",
          "value": "accelerometer=(), ambient-light-sensor=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
        }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, immutable, max-age=31536000"
        }
      ]
    },
    {
      "source": "/index.html",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "max-age=3600, must-revalidate"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### E. GitHub Pages (with Cloudflare)

If using GitHub Pages with custom domain, configure through Cloudflare:

**Cloudflare Page Rules:**
1. Go to your domain → Page Rules
2. Create rule for `kcalculator.eu/*`:
   - Security Level: High
   - Enable WAF
   - Browser Cache TTL: 1 year for `/assets/*`

**Cloudflare Workers (Alternative Headers):**

```javascript
// wrangler.toml
name = "kcalculator-security"
type = "javascript"
account_id = "your-account-id"
workers_dev = false
route = "kcalculator.eu/*"

[[env.production.routes]]
pattern = "kcalculator.eu/*"
zone_name = "kcalculator.eu"

// src/index.js
export default {
  async fetch(request) {
    const response = await fetch(request);
    
    const headers = new Headers(response.headers);
    headers.set('X-Frame-Options', 'DENY');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-XSS-Protection', '1; mode=block');
    headers.set('Referrer-Policy', 'strict-no-referrer');
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    headers.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://world.openfoodfacts.org https://api.supabase.co; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests");
    headers.set('Permissions-Policy', 'accelerometer=(), ambient-light-sensor=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
```

---

## 3. Vite-Specific CSP Considerations

### Default CSP for Vite (Recommended)

```
Content-Security-Policy:
  default-src 'none';
  script-src 'self';
  style-src 'self';
  img-src 'self' data: https:;
  font-src 'self';
  connect-src 'self' https://world.openfoodfacts.org https://api.supabase.co;
  frame-ancestors 'none';
  base-uri 'self';
  object-src 'none';
  form-action 'self';
  upgrade-insecure-requests;
```

**Why this works for kcalculator:**
- ✅ `script-src 'self'`: Vite bundles all scripts
- ✅ `style-src 'self'`: Vite bundles CSS
- ✅ `connect-src`: Allows OpenFoodFacts API + Supabase
- ✅ `img-src 'self' data: https:`: Allows app images and external APIs
- ✅ `frame-ancestors 'none'`: Prevents clickjacking

### Testing CSP with Content-Security-Policy-Report-Only

Before deploying strict CSP, test with report-only header:

```
Content-Security-Policy-Report-Only: default-src 'none'; ...; report-uri https://your-report-endpoint.com
```

This logs violations without blocking content.

---

## 4. TLS/SSL Configuration

### Update TLS to Modern Ciphers

**Check current ciphers:**
```bash
openssl s_client -connect kcalculator.eu:443 -tls1_2
openssl s_client -connect kcalculator.eu:443 -tls1_3
```

**Recommended cipher order (Nginx):**
```nginx
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305';
ssl_prefer_server_ciphers off;
ssl_protocols TLSv1.2 TLSv1.3;
```

---

## 5. Web Application Firewall (WAF) Solutions

### Cloudflare (Recommended for Small Sites - FREE)

**Benefits:**
- ✅ Free tier includes DDoS protection
- ✅ WAF rules (OWASP Core Ruleset)
- ✅ Bot management
- ✅ Rate limiting
- ✅ Caching & CDN
- ✅ Automatic HTTPS/HSTS

**Setup:**
1. Change nameservers to Cloudflare
2. Enable WAF in dashboard
3. Configure Firewall Rules:
   - Block known bots
   - Rate limit to 100 req/min per IP
   - OWASP Core Ruleset (Sensitive)

### AWS WAF

For higher traffic:
```yaml
# CloudFormation template excerpt
WebACL:
  Type: AWS::WAFv2::WebACL
  Properties:
    Scope: CLOUDFRONT
    DefaultAction:
      Allow: {}
    Rules:
      - Name: AWSManagedRulesCommonRuleSet
        Priority: 0
        Action:
          Block: {}
        VisibilityConfig:
          SampledRequestsEnabled: true
          CloudWatchMetricsEnabled: true
          MetricName: AWSManagedRulesCommonRuleSet
        Statement:
          ManagedRuleGroupStatement:
            VendorName: AWS
            Name: AWSManagedRulesCommonRuleSet
```

### Azure Application Gateway (WAF)

Enterprise option with advanced features.

---

## 6. Security Checklist

- [ ] Deploy HTTPS with valid certificate (Let's Encrypt)
- [ ] Update TLS to only TLSv1.2 + TLSv1.3
- [ ] Set modern cipher suites
- [ ] Add X-Frame-Options: DENY
- [ ] Add X-Content-Type-Options: nosniff
- [ ] Add Strict-Transport-Security header
- [ ] Implement Content-Security-Policy
- [ ] Add Referrer-Policy: strict-no-referrer
- [ ] Add Permissions-Policy
- [ ] Enable OCSP Stapling
- [ ] Implement WAF (Cloudflare or AWS)
- [ ] Test with SecurityHeaders.com
- [ ] Monitor CSP violations
- [ ] Set up rate limiting (100-1000 req/min)
- [ ] Enable gzip compression
- [ ] Set cache headers correctly
- [ ] Deny access to `.env`, `.git`, etc.

---

## 7. Testing & Validation

### Free Online Tools

1. **SecurityHeaders.com**: https://securityheaders.com
   - Paste `kcalculator.eu`
   - Should show A or A+

2. **SSL Labs**: https://www.ssllabs.com/ssltest/
   - Check TLS configuration
   - Aim for A+ rating

3. **Content Security Policy Analyzer**: https://csp-evaluator.withgoogle.com

4. **Mozilla Observatory**: https://observatory.mozilla.org

---

## 8. Implementation Priority

**Phase 1 (Critical):**
1. Enable HTTPS only (redirect HTTP)
2. Add X-Frame-Options, X-Content-Type-Options, HSTS
3. Implement basic CSP

**Phase 2 (High):**
1. Update TLS ciphers
2. Add all security headers
3. Enable Cloudflare WAF

**Phase 3 (Nice-to-have):**
1. CSP monitoring/reporting
2. Advanced bot protection
3. Rate limiting rules

---

## 9. Current kcalculator.eu Config Template

Based on your app (OpenFoodFacts API, Supabase):

```
DEFAULT CONTENT-SECURITY-POLICY:

default-src 'none';
script-src 'self';
style-src 'self';
img-src 'self' data: https://world.openfoodfacts.org;
font-src 'self';
connect-src 'self' https://world.openfoodfacts.org https://api.supabase.co;
frame-ancestors 'none';
base-uri 'self';
object-src 'none';
form-action 'self';
upgrade-insecure-requests;

ALLOWED EXTERNAL CONNECTIONS:
- API: https://world.openfoodfacts.org/cgi/search.pl
- Backend: https://api.supabase.co (your Supabase project)
```

---

**Next Step:** 
Which hosting platform are you currently using for kcalculator.eu? I can provide exact deployment steps for that specific setup.
