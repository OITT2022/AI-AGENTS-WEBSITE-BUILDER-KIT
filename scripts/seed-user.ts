/**
 * Seed a user into the database.
 * Usage: npx tsx --env-file=.env scripts/seed-user.ts
 */
import { Pool } from 'pg';
import crypto from 'crypto';

const host = process.env.AURORA_HOST;
const user = process.env.AURORA_USER;
const password = process.env.AURORA_PASSWORD;
const database = process.env.AURORA_DB || 'postgres';

if (!host || !user || !password) {
  console.error('Set AURORA_HOST, AURORA_USER, AURORA_PASSWORD in .env');
  process.exit(1);
}

const pool = new Pool({
  host, port: 5432, user, password, database,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const email = 'avi@oitt.co.il';
  const name = 'Avi';
  const pass = '123456';
  const hash = crypto.createHash('sha256').update(pass).digest('hex');
  const now = new Date().toISOString();

  const result = await pool.query(
    `INSERT INTO users (id, email, name, password_hash, role, active, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'admin', true, $4, $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = $3, updated_at = $4
     RETURNING id, email, name, role`,
    [email, name, hash, now]
  );

  console.log('User created/updated:', result.rows[0]);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
