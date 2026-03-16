// server.js - Express.js with security headers for kcalculator.eu
// npm install express helmet compression
// Run: node server.js or npm start

import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Trust proxy for X-Forwarded-* headers
app.set('trust proxy', 1);

// ═══════════════════════════════════════════════════════════════
// Security Middleware
// ═══════════════════════════════════════════════════════════════

// Helmet.js configuration
app.use(helmet({
  // Content Security Policy
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
    reportOnly: false,
  },
  
  // Strict Transport Security (2 years, includes subdomains, preload)
  strictTransportSecurity: {
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true,
  },

  // Frame options
  frameguard: {
    action: 'deny',
  },

  // Prevent MIME type sniffing
  noSniff: true,

  // XSS protection
  xssFilter: true,

  // Referrer policy
  referrerPolicy: {
    policy: 'strict-no-referrer',
  },

  // Permissions policy
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
app.use(compression({
  threshold: 1024,
  level: 6,
}));

// ═══════════════════════════════════════════════════════════════
// Static File Serving
// ═══════════════════════════════════════════════════════════════

const distPath = path.join(__dirname, 'dist');

// Serve static files with proper cache headers
app.use(express.static(distPath, {
  maxAge: '1y',
  immutable: true,
  etag: false,
}));

// ═══════════════════════════════════════════════════════════════
// Caching Strategy
// ═══════════════════════════════════════════════════════════════

// Cache versioned assets (Vite adds hashes)
app.use((req, res, next) => {
  if (/\/assets\/.*\.[0-9a-f]{8}/.test(req.path)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', 'W/"' + Date.now() + '"');
  }
  next();
});

// Short cache for index.html
app.get('/index.html', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
  next();
});

// ═══════════════════════════════════════════════════════════════
// SPA Fallback Routing
// ═══════════════════════════════════════════════════════════════

// Route all requests to index.html (except static files)
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  
  // Check if file exists first
  fs.stat(req.path.substring(1), (err) => {
    if (err && err.code === 'ENOENT') {
      // File not found, serve index.html for SPA routing
      res.sendFile(indexPath);
    } else {
      // File exists or other error, let express handle it
      res.status(404).send('Not found');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ═══════════════════════════════════════════════════════════════
// Server Startup
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

app.listen(PORT, HOST, () => {
  console.log(`✓ Server running at http://${HOST}:${PORT}`);
  console.log(`✓ Serving: ${distPath}`);
  console.log(`✓ CSP: Enabled`);
  console.log(`✓ HSTS: Enabled (2 years)`);
  console.log(`✓ Compression: Enabled`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});
