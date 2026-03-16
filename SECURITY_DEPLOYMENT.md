# Security Implementation Checklist & Deployment Guide

## Quick Start: Which Hosting Platform?

### Current Setup Question
> Is kcalculator.eu currently hosted on:
> - [ ] Self-hosted Nginx/Linux?
> - [ ] Netlify?
> - [ ] Vercel?
> - [ ] GitHub Pages + Cloudflare?
> - [ ] Other (AWS, Azure, DigitalOcean)?

---

## Deployment by Platform

### 🔧 Self-Hosted (Nginx/Linux)

**Step 1: Copy Nginx Configuration**
```bash
sudo cp nginx.conf /etc/nginx/sites-available/kcalculator.eu
sudo ln -s /etc/nginx/sites-available/kcalculator.eu /etc/nginx/sites-enabled/
```

**Step 2: Test Configuration**
```bash
sudo nginx -t
# Output: nginx: configuration file test is successful
```

**Step 3: Reload Nginx**
```bash
sudo systemctl reload nginx
# Or: sudo service nginx reload
```

**Step 4: Verify Headers**
```bash
# Check headers are configured
curl -I https://kcalculator.eu | grep -i "X-Frame\|X-Content\|Strict-Transport"

# Should show:
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

**Step 5: Test SSL/TLS**
```bash
openssl s_client -connect kcalculator.eu:443 -tls1_2
openssl s_client -connect kcalculator.eu:443 -tls1_3
# Check for "ECDHE" ciphers (good) not "DES" or "RC4" (bad)
```

**Step 6: Verify with Online Tools**
- SecurityHeaders.com: https://securityheaders.com
- SSL Labs: https://www.ssllabs.com/ssltest/

---

### 🚀 Netlify Deployment

**Step 1: Copy Configuration**
```bash
cp netlify.toml /path/to/your/repo/root/
```

**Step 2: Commit & Push**
```bash
git add netlify.toml
git commit -m "Security: Add security headers and CSP"
git push origin main
```

**Step 3: Netlify Auto-Deploys**
- Netlify detects `netlify.toml` and applies configuration automatically
- Check Deploys tab in Netlify dashboard

**Step 4: Configure Cloudflare WAF (Optional but Recommended)**
1. Point your domain DNS to Cloudflare (free tier)
2. Cloudflare → domain → Security → WAF
3. Enable OWASP ModSecurity Core Ruleset (Sensitive)
4. Create Rate Limiting Rule:
   - URI Path: `/*`
   - Threshold: 100 requests per 10 seconds
   - Action: Challenge/Block

**Step 5: Verify**
```bash
curl -I https://kcalculator.eu
# Check for security headers
```

---

### ⚡ Vercel Deployment

**Step 1: Copy Configuration**
```bash
cp vercel.json /path/to/your/repo/root/
```

**Step 2: Commit & Push**
```bash
git add vercel.json
git commit -m "Security: Add security headers and CSP"
git push origin main
```

**Step 3: Vercel Auto-Deploys**
- Vercel detects `vercel.json` and applies configuration
- Check Deployments tab in Vercel dashboard

**Step 4: Add Custom Domain (if needed)**
1. Vercel → Project Settings → Domains
2. Add `kcalculator.eu` and `www.kcalculator.eu`
3. Follow DNS instructions

**Step 5: Enable Cloudflare WAF**
1. Cloudflare → yoursite → Security → WAF
2. Enable OWASP Core Ruleset
3. Create rate limit rule (100 req/10s)

---

### 🌐 Express.js Server (Self-Hosted Node)

**Step 1: Install Dependencies**
```bash
npm install express helmet compression
```

**Step 2: Copy Server File**
```bash
cp server.js /path/to/your/production/server/
```

**Step 3: Add to package.json**
```json
{
  "scripts": {
    "build": "vite build",
    "start": "node server.js",
    "start:prod": "NODE_ENV=production node server.js"
  }
}
```

**Step 4: Build & Start**
```bash
npm run build
npm run start:prod
# Server should be running on http://localhost:3000
```

**Step 5: Use Process Manager (PM2 for Production)**
```bash
npm install -g pm2

# Create ecosystem.config.js
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'kcalculator',
    script: './server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    instances: 'max',
    exec_mode: 'cluster',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**Step 6: Use Nginx as Reverse Proxy**
```nginx
upstream kcalculator {
    server localhost:3000;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name kcalculator.eu www.kcalculator.eu;
    
    ssl_certificate /etc/letsencrypt/live/kcalculator.eu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kcalculator.eu/privkey.pem;
    
    # Let Express.js handle security headers
    # (Don't duplicate in Nginx when using Express+Helmet)
    
    location / {
        proxy_pass http://kcalculator;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Security Testing Checklist

### Phase 1: Basic Headers (Same Day)
- [ ] Copy appropriate config file (nginx.conf / netlify.toml / vercel.json / server.js)
- [ ] Deploy to production
- [ ] Test with: `curl -I https://kcalculator.eu`
- [ ] Verify these headers appear:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Strict-Transport-Security: max-age=...`
  - `Content-Security-Policy: ...` (or report CSP violations for now)

### Phase 2: CSP Testing (Day 1-3)
- [ ] Monitor browser console for CSP violations
- [ ] Check CSP Report-Only mode if needed:
  ```bash
  curl -I https://kcalculator.eu | grep CSP
  ```
- [ ] Test app functionality:
  - [ ] Load page ✓
  - [ ] Add food items ✓
  - [ ] Save favorites ✓
  - [ ] API calls work (OpenFoodFacts) ✓

### Phase 3: Online Security Validation (Day 3-5)
- [ ] SecurityHeaders.com: Target A+ rating
- [ ] SSL Labs: Target A+ rating
- [ ] Mozilla Observatory: Target A+ rating
- [ ] Verify no CSP violations in browser console
- [ ] Test on mobile devices

### Phase 4: WAF Configuration (Day 5-7)
- [ ] Enable Cloudflare WAF (free tier)
- [ ] Configure rate limiting (100 req/min)
- [ ] Monitor for false positives
- [ ] Enable OWASP ModSecurity ruleset (Sensitive)

---

## Expected Test Results

### SecurityHeaders.com Target
```
✓ X-Frame-Options: DENY
✓ X-Content-Type-Options: nosniff
✓ Strict-Transport-Security: with preload
✓ Content-Security-Policy: configured
✓ Referrer-Policy: strict-no-referrer
✓ Permissions-Policy: configured

GRADE: A+
```

### SSL Labs Target
```
❯ Protocol Support: TLS 1.2, TLS 1.3
❯ Cipher Suites: ECDHE-RSA-AES256-GCM-SHA384, ECDHE-RSA-CHACHA20-POLY1305
❯ Server Preferences: Configured (modern ciphers)
❯ OCSP Stapling: Yes
❯ Certificate: Valid, no issues

GRADE: A+ or 90+
```

---

## CSP Violations - How to Debug

### Check Browser Console
1. Open DevTools (F12)
2. Go to Console tab
3. Look for messages like:
   ```
   Refused to load the script 'https://example.com/script.js' 
   because it violates the following Content Security Policy directive: ...
   ```

### Common CSP Violations in Vite Apps

**Issue**: Script blocked
- **Cause**: Inline scripts without nonce
- **Solution**: Vite bundles scripts, shouldn't happen

**Issue**: External API blocked
- **Cause**: API domain not in `connect-src`
- **Solution**: Add to CSP: `connect-src 'self' https://your-api.com`

**Issue**: Font blocked**
- **Cause**: Font domain not in `font-src`
- **Solution**: Add to CSP: `font-src 'self' https://fonts.googleapis.com`

### Temporarily Use CSP Report-Only
While testing, use `Content-Security-Policy-Report-Only` header:
```
Content-Security-Policy-Report-Only: default-src 'self'; ...
```
This logs violations but doesn't block resources.

Once issues are fixed, switch to enforcing `Content-Security-Policy`.

---

## Cloudflare WAF Setup (Step-by-Step)

1. **Log into Cloudflare Dashboard**
   - Navigate to your domain (kcalculator.eu)

2. **Enable WAF**
   - Security > WAF > OWASP ModSecurity Core Ruleset
   - Set to "Sensitive" (blocks more threats)

3. **Create Rate Limiting Rule**
   - Security > Rate Limiting
   - Request rate limit: 100 requests per 60 seconds
   - Action: Block or Challenge

4. **Create Firewall Rules (Optional)**
   - Security > Firewall Rules
   - Block bots: `(cf.bot_management.score < 50)`
   - Challenge high threat: `(cf.threat_score >= 50)`

5. **Configure SSL/TLS**
   - SSL/TLS > Overview
   - Set to "Full (strict)" for best security

6. **Enable HSTS (Optional in Cloudflare)**
   - SSL/TLS > HSTS
   - Max Age: 12 months
   - Include Subdomains: Yes
   - Preload: Yes

---

## Rollback Plan

If issues occur:

1. **Nginx**: Comment out security headers and reload
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

2. **Netlify**: Modify netlify.toml and push
   ```bash
   git commit --amend -m "Revert security headers"
   git push --force-with-lease
   ```

3. **Vercel**: Delete vercel.json and redeploy
   ```bash
   git rm vercel.json
   git commit -m "Revert security headers"
   git push
   ```

4. **Check for 5xx errors**: Monitor error logs
---

## Monitoring & Maintenance

### Monthly Review
- [ ] Check SSL certificate expiration (if self-hosted)
- [ ] Review CSP violations in logs
- [ ] Verify no new security warnings
- [ ] Test with latest security scanners

### Annual Update
- [ ] Update TLS cipher suites (if needed)
- [ ] Rotate CSP nonce (if used)
- [ ] Review new security best practices

---

## Support & Further Reading

- **OWASP**: https://owasp.org/www-project-top-ten/
- **Mozilla Security**: https://infosec.mozilla.org/guidelines/web_security
- **Helmet.js Docs**: https://helmetjs.github.io/
- **Content Security Policy**: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
- **SSL Labs Best Practices**: https://github.com/ssllabs/research/wiki/SSL-and-TLS-Deployment-Best-Practices

---

## Summary

✓ **X-Frame-Options**: Prevents clickjacking
✓ **X-Content-Type-Options**: Prevents MIME sniffing
✓ **Strict-Transport-Security**: Forces HTTPS
✓ **Content-Security-Policy**: Controls resource loading
✓ **Referrer-Policy**: Protects user privacy
✓ **Permissions-Policy**: Restricts browser features
✓ **Modern TLS (1.2+)**: Strong encryption
✓ **WAF**: Blocks common attacks
✓ **Rate Limiting**: Prevents abuse

**Expected Outcome**: A+ rating on SecurityHeaders.com & SSL Labs ✓
