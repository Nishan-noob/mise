import fs from 'fs';
import path from 'path';
import { getPool } from '../config/database';

export async function runSeed() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    console.log('[SEED] Running seed file...');
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', '002_seed.sql'),
      'utf8'
    );
    await client.query(sql);
    console.log('[SEED] ✓ Seed data applied');
  } finally {
    client.release();
  }
}

// CLI entrypoint: tsx src/db/seed.ts
if (require.main === module) {
  import('dotenv/config').then(() => {
    runSeed()
      .then(() => process.exit(0))
      .catch((err) => { console.error('[SEED] Fatal:', err); process.exit(1); });
  });
}
