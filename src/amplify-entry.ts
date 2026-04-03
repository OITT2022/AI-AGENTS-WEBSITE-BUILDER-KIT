// Catch ALL errors including uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT:', err.stack || err.message);
  // Start emergency diagnostic server
  const http = require('http');
  http.createServer((_req: any, res: any) => {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('UNCAUGHT: ' + (err.stack || err.message));
  }).listen(3000);
});

const path = require('path');
const fs = require('fs');
const http = require('http');

// Load env.json
try {
  const jsonPath = path.join(__dirname, 'env.json');
  if (fs.existsSync(jsonPath)) {
    const vars = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    for (const [key, val] of Object.entries(vars)) {
      if (typeof val === 'string') process.env[key] = val;
    }
  }
} catch {}

// Try loading server
let app: any = null;
let error: string = '';

try {
  app = require('./server').default;
} catch (e: any) {
  error = (e.stack || e.message || String(e));
  console.error('SERVER LOAD FAILED:', error);
}

if (!app) {
  http.createServer((_req: any, res: any) => {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('LOAD ERROR:\n' + error);
  }).listen(3000, () => console.log('Error server on 3000'));
} else {
  const { initDatabase } = require('./db/store');
  const { ensureDefaultAdmin } = require('./services/auth');
  (async () => {
    try { await initDatabase(); } catch {}
    try { await ensureDefaultAdmin(); } catch {}
    app.listen(3000, () => console.log('OK on 3000'));
  })();
}
