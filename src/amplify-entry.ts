/**
 * AWS Amplify SSR compute entry point.
 * Loads env.json then starts the Express server on port 3000.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const fs = require('fs');

// Load env.json written during Amplify build
const jsonPath = path.join(__dirname, 'env.json');
if (fs.existsSync(jsonPath)) {
  try {
    const vars = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    for (const [key, val] of Object.entries(vars)) {
      if (!process.env[key] && typeof val === 'string') {
        process.env[key] = val;
      }
    }
    console.log('[amplify-entry] Loaded env.json, keys:', Object.keys(vars).join(', '));
  } catch (e) {
    console.error('[amplify-entry] Failed to parse env.json:', e);
  }
} else {
  console.log('[amplify-entry] No env.json at', jsonPath);
}

console.log('[amplify-entry] DB_PROVIDER:', process.env.DB_PROVIDER ?? '(not set)');
console.log('[amplify-entry] DATABASE_URL set:', !!process.env.DATABASE_URL);

// Use require (not dynamic import) for CommonJS compatibility
const app = require('./server').default;
const { initDatabase } = require('./db/store');
const { ensureDefaultAdmin } = require('./services/auth');

const PORT = process.env.PORT ?? 3000;

(async () => {
  try {
    await initDatabase();
    console.log('[amplify-entry] Database initialized.');
  } catch (err) {
    console.error('[amplify-entry] Database init failed:', err);
  }

  try {
    await ensureDefaultAdmin();
  } catch (err) {
    console.error('[amplify-entry] ensureDefaultAdmin failed:', err);
  }

  app.listen(PORT, () => {
    console.log(`[amplify-entry] Server running on port ${PORT}`);
  });
})().catch((err: any) => {
  console.error('[amplify-entry] Fatal:', err);
  process.exit(1);
});
