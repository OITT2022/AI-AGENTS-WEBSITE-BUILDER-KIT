/**
 * AWS Amplify SSR compute entry point.
 *
 * Amplify compute requires a Node.js HTTP server listening on port 3000.
 * This file is compiled to dist/amplify-entry.js, then copied to
 * .amplify-hosting/compute/default/index.js during the build.
 */

import app from './server';
import { initDatabase } from './db/store';
import { ensureDefaultAdmin } from './services/auth';

const PORT = process.env.PORT ?? 3000;

(async () => {
  await initDatabase();
  await ensureDefaultAdmin();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
