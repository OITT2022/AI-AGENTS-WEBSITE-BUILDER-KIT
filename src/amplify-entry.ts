/**
 * AWS Amplify SSR compute entry point.
 * Loads .env before any other imports since Amplify doesn't inject env vars at runtime.
 */

import path from 'path';
import fs from 'fs';

// Load .env from same directory (written during Amplify build)
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
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
  console.log('[amplify-entry] Loaded .env from', envPath);
} else {
  console.log('[amplify-entry] No .env file found at', envPath);
}

console.log('[amplify-entry] DB_PROVIDER:', process.env.DB_PROVIDER ?? '(not set)');
console.log('[amplify-entry] DATABASE_URL set:', !!process.env.DATABASE_URL);

// Now import app (after env is loaded)
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
