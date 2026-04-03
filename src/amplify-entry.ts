// AWS Amplify SSR compute entry point
const path = require('path');
const fs = require('fs');

// Load env.json (Amplify doesn't inject env vars at runtime)
try {
  const jp = path.join(__dirname, 'env.json');
  if (fs.existsSync(jp)) {
    const v = JSON.parse(fs.readFileSync(jp, 'utf-8'));
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === 'string') process.env[k] = val;
    }
  }
} catch {}

// Load and start the Express app
const app = require('./server').default;
const { initDatabase } = require('./db/store');
const { ensureDefaultAdmin } = require('./services/auth');

(async () => {
  try { await initDatabase(); } catch (e: any) { console.error('DB init:', e.message); }
  try { await ensureDefaultAdmin(); } catch (e: any) { console.error('Admin:', e.message); }
  app.listen(3000, () => console.log('Server on port 3000'));
})();
