import app from '../src/server';
import { initDatabase } from '../src/db/store';
import { ensureDefaultAdmin } from '../src/services/auth';

let initialized = false;

async function init() {
  if (initialized) return;
  await initDatabase();
  await ensureDefaultAdmin();
  initialized = true;
}

export default async function handler(req: any, res: any) {
  await init();
  return app(req, res);
}
