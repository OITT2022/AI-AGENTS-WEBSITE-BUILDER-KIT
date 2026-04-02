/**
 * AWS Amplify SSR compute entry point.
 *
 * Amplify compute requires a Node.js HTTP server listening on port 3000.
 * Env vars are written to .env during build (not injected at runtime).
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '.env') });

import app from './server';
import { initDatabase } from './db/store';
import { ensureDefaultAdmin } from './services/auth';

const PORT = process.env.PORT ?? 3000;

console.log('[amplify-entry] Starting...');
console.log('[amplify-entry] DB_PROVIDER:', process.env.DB_PROVIDER ?? '(not set)');
console.log('[amplify-entry] DATABASE_URL set:', !!process.env.DATABASE_URL);
console.log('[amplify-entry] PORT:', PORT);

(async () => {
  try {
    console.log('[amplify-entry] Initializing database...');
    await initDatabase();
    console.log('[amplify-entry] Database initialized.');
  } catch (err) {
    console.error('[amplify-entry] Database init failed:', err);
    // Start server anyway so health checks work and we can see the error
  }

  try {
    await ensureDefaultAdmin();
  } catch (err) {
    console.error('[amplify-entry] ensureDefaultAdmin failed:', err);
  }

  app.listen(PORT, () => {
    console.log(`[amplify-entry] Server running on port ${PORT}`);
  });
})().catch((err) => {
  console.error('[amplify-entry] Fatal:', err);
  process.exit(1);
});
