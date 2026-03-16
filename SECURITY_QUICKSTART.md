# Security Headers Implementation - Which Config to Use?

## 🤔 Decision Tree: Choose Your Platform

```
START: How is kcalculator.eu currently hosted?

├─ [SELF-HOSTED] Own Linux/Ubuntu server with Nginx?
│  └─ USE: nginx.conf
│     └─ Deploy: Copy to /etc/nginx/sites-available/
│     └─ Command: sudo systemctl reload nginx
│
├─ [SERVERLESS] Deployed on Netlify?
│  └─ USE: netlify.toml
│     └─ Deploy: Commit & push to GitHub
│     └─ Auto-deploys via Netlify
│
├─ [SERVERLESS] Deployed on Vercel?
│  └─ USE: vercel.json
│     └─ Deploy: Commit & push to GitHub
│     └─ Auto-deploys via Vercel
│
├─ [NODE] Running Node.js/Express server?
│  └─ USE: server.js
│     └─ Deploy: npm install && npm run build && npm start
│     └─ Use PM2 for process management
│
├─ [CLOUDFLARE] Using Cloudflare Workers?
│  └─ USE: SECURITY_HEADERS.md Worker example
│     └─ Deploy: Create worker in Cloudflare dashboard
│
└─ [OTHER] AWS, Azure, GCP, cPanel, etc?
   └─ USE: SECURITY_HEADERS.md for custom setup
      └─ Follow the "Implement these headers for common static hosting setups"
```

---

## 📋 Files in This Repository

| File | Purpose | For Whom |
|------|---------|----------|
| **SECURITY_HEADERS.md** | Complete security guide with explanations | Everyone (reference) |
| **SECURITY_DEPLOYMENT.md** | Step-by-step deployment guide | Everyone (implementation) |
| **CSP_REFERENCE.md** | Content-Security-Policy quick reference | Everyone (tuning CSP) |
| **nginx.conf** | Ready-to-use Nginx config | Self-hosted users |
| **netlify.toml** | Ready-to-use Netlify config | Netlify users |
| **vercel.json** | Ready-to-use Vercel config | Vercel users |
| **server.js** | Ready-to-use Express.js server | Node.js users |

---

## 🚀 Quick Start by Platform

### 1️⃣ Self-Hosted Nginx

**Current Setup**:
- Server: Ubuntu/Debian Linux
- Web Server: Nginx
- Domain: kcalculator.eu (with SSL via Let's Encrypt)

**Action**:
```bash
# 1. Copy config
sudo cp nginx.conf /etc/nginx/sites-available/kcalculator.eu

# 2. Enable site
sudo ln -s /etc/nginx/sites-available/kcalculator.eu /etc/nginx/sites-enabled/

# 3. Test
sudo nginx -t

# 4. Reload
sudo systemctl reload nginx

# 5. Verify
curl -I https://kcalculator.eu | grep "X-Frame"
```

**After Deployment**:
- ✓ Check with SecureHeaders.com
- ✓ Check with SSLLabs.com
- ✓ Monitor error logs

**Time to Deploy**: ~5 minutes

---

### 2️⃣ Netlify

**Current Setup**:
- Hosting: Netlify
- Deployment: From GitHub
- Build command: `npm run build`

**Action**:
```bash
# 1. Copy config
cp netlify.toml ./

# 2. Commit & push
git add netlify.toml
git commit -m "Security: Add security headers"
git push origin main

# 3. Netlify auto-deploys
# Check Deploys tab in dashboard

# 4. Optional: Add Cloudflare WAF
# Change DNS to Cloudflare (free tier)
# Enable WAF in Cloudflare dashboard
```

**After Deployment**:
- ✓ Check Netlify deployment logs
- ✓ Test CSP in browser console
- ✓ Enable Cloudflare WAF (recommended)

**Time to Deploy**: ~2 minutes

---

### 3️⃣ Vercel

**Current Setup**:
- Hosting: Vercel
- Deployment: From GitHub
- Build command: `npm run build`

**Action**:
```bash
# 1. Copy config
cp vercel.json ./

# 2. Commit & push
git add vercel.json
git commit -m "Security: Add security headers"
git push origin main

# 3. Vercel auto-deploys
# Check Deployments tab

# 4. Optional: Add Cloudflare WAF
# In Cloudflare: DNS → Add "kcalculator.eu"
# Route traffic through Cloudflare
```

**After Deployment**:
- ✓ Check Vercel deployment logs
- ✓ Verify headers were applied
- ✓ Test CSP

**Time to Deploy**: ~2 minutes

---

### 4️⃣ Node.js / Express Server

**Current Setup**:
- Server: Node.js with Express or similar
- Hosting: Self-hosted, DigitalOcean, Heroku, etc.

**Action**:
```bash
# 1. Copy server file
cp server.js /path/to/production/

# 2. Install dependencies
npm install express helmet compression

# 3. Update package.json
# Change "scripts": { "start": "node server.js" }

# 4. Build and start
npm run build
npm start

# 5. (Optional) Use PM2 for management
npm install -g pm2
pm2 start server.js --name kcalculator
pm2 save && pm2 startup
```

**After Deployment**:
- ✓ Test locally first: `npm run build && npm start`
- ✓ Verify headers: `curl -I http://localhost:3000`
- ✓ Deploy to production
- ✓ Use Nginx as reverse proxy (optional)

**Time to Deploy**: ~10 minutes

---

### 5️⃣ GitHub Pages + Cloudflare

**Current Setup**:
- Repository: GitHub
- Hosting: GitHub Pages
- Domain: Custom domain via Cloudflare

**Action**:
```bash
# 1. Cloudflare → Workers → Create Worker
# Copy CSP code from SECURITY_HEADERS.md Worker Example

# 2. Deploy Worker → Route to kcalculator.eu

# 3. Enable WAF in Cloudflare
# Cloudflare dashboard → Security → WAF

# 4. Configure SSL
# Cloudflare → SSL/TLS → Set to "Full (strict)"
```

**After Deployment**:
- ✓ Test with curl
- ✓ Monitor Worker analytics
- ✓ Check CSP violations

**Time to Deploy**: ~15 minutes

---

## ⚠️ Common Mistakes to Avoid

### ❌ Mistake 1: Wrong CSP for Your APIs
**Problem**: CSP blocks your OpenFoodFacts or Supabase calls

**Solution**: Ensure CSP includes:
```
connect-src 'self' https://world.openfoodfacts.org https://api.supabase.co
```

### ❌ Mistake 2: Not Testing Before Deploy
**Problem**: Deploy to production, app breaks

**Solution**: 
1. Test locally first
2. Use `Content-Security-Policy-Report-Only` header first
3. Monitor browser console for violations
4. Then switch to enforcing CSP

### ❌ Mistake 3: Forgetting HSTS Preload
**Problem**: Browsers still allow HTTP on first visit

**Solution**: Make sure HSTS header includes:
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

### ❌ Mistake 4: Not Redirecting HTTP → HTTPS
**Problem**: Users can still visit `http://kcalculator.eu`

**Solution**: Configure HTTP redirect
```nginx
# Nginx
return 301 https://$server_name$request_uri;
```

### ❌ Mistake 5: Weak TLS Ciphers Still Enabled
**Problem**: SSL Labs shows C or D rating

**Solution**: Update TLS config
```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-*:DHE-*';
```

---

## 🧪 Testing Checklist After Deployment

### Immediate Checks (Same Day)
- [ ] Site loads without errors
- [ ] No 404 or 500 errors
- [ ] All pages accessible
- [ ] CSS and images load
- [ ] No red errors in browser console

### Security Validation (Day 1-3)
- [ ] Run: `curl -I https://kcalculator.eu | grep -i "x-frame\|csp\|hsts"`
- [ ] Visit: https://securityheaders.com
- [ ] Visit: https://www.ssllabs.com/ssltest/
- [ ] Check CSP violations in DevTools Console
- [ ] Test on mobile device

### Functionality Testing (Day 3-5)
- [ ] Can search foods (OpenFoodFacts API)
- [ ] Can login (Supabase auth)
- [ ] Can save favorites
- [ ] Can add daily entries
- [ ] Can view reports
- [ ] Dark mode works
- [ ] Mobile responsive

### Expected Results
- SecurityHeaders.com: **A+** (100 points)
- SSL Labs: **A** or **A+** (85+ points)
- Mozilla Observatory: **A+** (135+ points)
- CSP Violations: **0** in console

---

## 📞 Support & Troubleshooting

### Header Not Showing Up
```bash
# Check what's currently set
curl -I https://kcalculator.eu | grep "Content-Security-Policy"

# Should show your CSP policy
```

### CSP Blocking Content
1. Check browser console for red CSP error
2. Add blocked domain to appropriate directive in CSP
3. Re-deploy
4. Test again

### HSTS Issues
- **Symptom**: Site won't load on HTTP anymore
- **Solution**: This is intentional! Redirect HTTP to HTTPS
- **Fix**: Ensure HTTP redirect is configured (see step 4 in Nginx/Vercel/Netlify)

### Nginx Won't Reload
```bash
# Check syntax
sudo nginx -t

# If error, check config
sudo cat /etc/nginx/sites-available/kcalculator.eu

# Fix path to SSL certificate filenames
```

### Still Getting Low Scores
- Check if all headers are being set
- Verify no whitespace in header values
- Use online tools to see exact response
- Check for duplicate or conflicting headers

---

## 📊 Security Score Progression

**Before Implementation**:
- SecurityHeaders.com: ❌ F (0 points)
- SSL Labs: ⚠️ C (50 points)
- Observatory: ❌ F (10 points)

**After Basic Headers**:
- SecurityHeaders.com: 🟡 C (60 points)
- SSL Labs: 🟡 B (75 points)
- Observatory: ⚠️ D (40 points)

**After Full Implementation + TLS Update + WAF**:
- SecurityHeaders.com: ✅ A+ (100 points)
- SSL Labs: ✅ A+ (100 points)
- Observatory: ✅ A+ (135+ points)

---

## 🎯 Success Criteria

✅ **Mission Accomplished When**:

1. ✓ X-Frame-Options header present
2. ✓ X-Content-Type-Options: nosniff
3. ✓ Strict-Transport-Security with preload
4. ✓ Content-Security-Policy configured
5. ✓ TLS 1.2+ and strong ciphers only
6. ✓ WAF enabled (Cloudflare or similar)
7. ✓ A+ rating on SecurityHeaders.com
8. ✓ A+ rating on SSL Labs
9. ✓ Zero CSP violations
10. ✓ App fully functional

---

## 🚀 Next Steps

1. **Identify your hosting**: Use decision tree above
2. **Copy the right config file**: nginx.conf, netlify.toml, vercel.json, or server.js
3. **Deploy according to SECURITY_DEPLOYMENT.md**
4. **Test with online tools**
5. **Monitor and iterate**

**Questions?** Check:
- SECURITY_HEADERS.md (detailed explanations)
- CSP_REFERENCE.md (CSP-specific tuning)
- SECURITY_DEPLOYMENT.md (step-by-step instructions)

---

**Ready to secure your site? Start with Step 1 above! 🔒**
