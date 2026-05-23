import 'dotenv/config';
import { getPool } from '../config/database';

async function seed() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    // Re-run seed file (idempotent via ON CONFLICT DO NOTHING)
    console.log('[SEED] Running seed file...');
    const fs = require('fs');
    const path = require('path');
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', '002_seed.sql'),
      'utf8'
    );
    await client.query(sql);
    console.log('[SEED] ✓ Seed data applied');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('[SEED] Fatal:', err);
  process.exit(1);
});
