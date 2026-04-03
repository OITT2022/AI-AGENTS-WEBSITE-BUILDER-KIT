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

// Load the Express app
const app = require('./server').default;
const { initDatabase } = require('./db/store');
const { ensureDefaultAdmin } = require('./services/auth');

// Start server IMMEDIATELY, init DB in background
app.listen(3000, () => {
  console.log('Server on port 3000');

  // DB init in background - don't block startup
  initDatabase()
    .then(() => ensureDefaultAdmin())
    .then(() => console.log('DB ready'))
    .catch((e: any) => console.error('DB init failed:', e.message));
});
