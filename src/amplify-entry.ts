/**
 * AWS Amplify SSR compute entry point.
 * Minimal version to diagnose startup crashes.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');

// Load env.json
const jsonPath = path.join(__dirname, 'env.json');
if (fs.existsSync(jsonPath)) {
  try {
    const vars = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    for (const [key, val] of Object.entries(vars)) {
      if (!process.env[key] && typeof val === 'string') {
        process.env[key] = val;
      }
    }
  } catch (e: any) {
    console.error('env.json parse error:', e.message);
  }
}

// Try to load the real app, fall back to a diagnostic server
let app: any;
let loadError: string | null = null;

try {
  app = require('./server').default;
} catch (e: any) {
  loadError = e.stack || e.message;
  console.error('FATAL: Failed to load server:', loadError);
}

if (app) {
  // Real app loaded successfully
  const { initDatabase } = require('./db/store');
  const { ensureDefaultAdmin } = require('./services/auth');

  (async () => {
    try { await initDatabase(); } catch (e) { console.error('DB init failed:', e); }
    try { await ensureDefaultAdmin(); } catch (e) { console.error('Admin seed failed:', e); }
    app.listen(3000, () => console.log('Server on port 3000'));
  })();
} else {
  // Diagnostic fallback -- shows the error
  http.createServer((_req: any, res: any) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Server failed to load',
      loadError,
      env: {
        DB_PROVIDER: process.env.DB_PROVIDER ?? '(not set)',
        DATABASE_URL_SET: !!process.env.DATABASE_URL,
        NODE_ENV: process.env.NODE_ENV ?? '(not set)',
        CWD: process.cwd(),
        DIRNAME: __dirname,
      },
      files: fs.readdirSync(__dirname).filter((f: string) => !f.includes('node_modules')).slice(0, 20),
    }, null, 2));
  }).listen(3000, () => console.log('Diagnostic server on port 3000'));
}
