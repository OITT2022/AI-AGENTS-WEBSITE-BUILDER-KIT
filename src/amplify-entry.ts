/**
 * AWS Amplify SSR compute entry point.
 *
 * This file is compiled to dist/amplify-entry.js, then copied to
 * .amplify-hosting/compute/default/index.js during the build.
 *
 * It wraps the Express app with @vendia/serverless-express so Amplify's
 * Lambda-backed compute can invoke it.
 */

import serverlessExpress from '@vendia/serverless-express';
import app from './server';
import { initDatabase } from './db/store';
import { ensureDefaultAdmin } from './services/auth';

let serverlessApp: ReturnType<typeof serverlessExpress> | null = null;
let initialized = false;

async function init() {
  if (initialized) return;
  await initDatabase();
  await ensureDefaultAdmin();
  initialized = true;
}

export const handler = async (event: any, context: any, callback: any) => {
  await init();
  if (!serverlessApp) {
    serverlessApp = serverlessExpress({ app });
  }
  return serverlessApp(event, context, callback);
};
