/**
 * AWS Amplify SSR compute entry point.
 * Loads env.json (written during build) before importing app modules.
 */

import path from 'path';
import fs from 'fs';

// Load env.json from same directory
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
  // Fallback: try .env
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx);
      const val = trimmed.slice(eqIdx + 1);
      if (!process.env[key]) process.env[key] = val;
    }
    console.log('[amplify-entry] Loaded .env fallback');
  }
}

console.log('[amplify-entry] DB_PROVIDER:', process.env.DB_PROVIDER ?? '(not set)');
console.log('[amplify-entry] DATABASE_URL set:', !!process.env.DATABASE_URL);

async function start() {
  const { default: app } = await import('./server');
  const { initDatabase } = await import('./db/store');
  const { ensureDefaultAdmin } = await import('./services/auth');

  const PORT = process.env.PORT ?? 3000;

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
}

start().catch((err) => {
  console.error('[amplify-entry] Fatal:', err);
  process.exit(1);
});
