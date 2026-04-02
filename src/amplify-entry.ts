// AWS Amplify SSR compute entry point
const path = require('path');
const fs = require('fs');
const http = require('http');

// Step 1: Load env.json
const jsonPath = path.join(__dirname, 'env.json');
let envLoaded = false;
try {
  if (fs.existsSync(jsonPath)) {
    const vars = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    for (const [key, val] of Object.entries(vars)) {
      if (typeof val === 'string') process.env[key] = val;
    }
    envLoaded = true;
  }
} catch {}

// Step 2: Try loading the real app
let app: any = null;
let loadError: string = '';

try {
  app = require('./server').default;
} catch (e: any) {
  loadError = (e.stack || e.message || 'unknown error').toString();
}

if (!app) {
  // Fallback: show what went wrong
  http.createServer((_req: any, res: any) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'server.js failed to load',
      loadError: loadError.split('\n').slice(0, 15),
      envLoaded,
      DATABASE_URL_SET: !!process.env.DATABASE_URL,
      DB_PROVIDER: process.env.DB_PROVIDER ?? 'not set',
    }, null, 2));
  }).listen(3000, () => console.log('Fallback diagnostic server on 3000'));
} else {
  // Real app
  const { initDatabase } = require('./db/store');
  const { ensureDefaultAdmin } = require('./services/auth');

  (async () => {
    try { await initDatabase(); } catch {}
    try { await ensureDefaultAdmin(); } catch {}
    app.listen(3000, () => console.log('Server on port 3000'));
  })();
}
