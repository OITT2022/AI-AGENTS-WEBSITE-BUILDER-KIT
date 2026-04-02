// AWS Amplify SSR compute entry point
const path = require('path');
const fs = require('fs');

// Step 1: Load env.json before anything else
const jsonPath = path.join(__dirname, 'env.json');
if (fs.existsSync(jsonPath)) {
  const vars = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  for (const [key, val] of Object.entries(vars)) {
    if (typeof val === 'string') process.env[key] = val;
  }
  console.log('[amplify] env.json loaded:', Object.keys(vars).join(', '));
}

console.log('[amplify] DB_PROVIDER:', process.env.DB_PROVIDER ?? 'not set');
console.log('[amplify] DATABASE_URL:', process.env.DATABASE_URL ? 'set' : 'NOT SET');

// Step 2: Load the Express app
let app: any;
try {
  app = require('./server').default;
  console.log('[amplify] server.js loaded OK');
} catch (e: any) {
  console.error('[amplify] FAILED to load server.js:', e.message);
  // Fallback: diagnostic server
  const http = require('http');
  http.createServer((_req: any, res: any) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message, stack: e.stack?.split('\n').slice(0, 10) }));
  }).listen(3000);
  throw e;  // also log to CloudWatch
}

// Step 3: Init DB and start
const { initDatabase } = require('./db/store');
const { ensureDefaultAdmin } = require('./services/auth');

(async () => {
  try { await initDatabase(); console.log('[amplify] DB initialized'); }
  catch (e: any) { console.error('[amplify] DB init error:', e.message); }

  try { await ensureDefaultAdmin(); }
  catch (e: any) { console.error('[amplify] Admin seed error:', e.message); }

  app.listen(3000, () => console.log('[amplify] Server on port 3000'));
})();
