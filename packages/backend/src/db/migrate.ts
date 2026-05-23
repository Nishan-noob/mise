import fs from 'fs';
import path from 'path';
import { getPool } from '../config/database';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export async function runMigrations() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT id FROM migrations WHERE name = $1',
        [file]
      );
      if (rows.length > 0) {
        console.log(`[MIGRATE] Skipping ${file} (already applied)`);
        continue;
      }

      console.log(`[MIGRATE] Applying ${file}...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[MIGRATE] ✓ ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[MIGRATE] ✗ ${file}:`, err);
        throw err;
      }
    }

    console.log('[MIGRATE] All migrations applied.');
  } finally {
    client.release();
  }
}

// CLI entrypoint: tsx src/db/migrate.ts
if (require.main === module) {
  import('dotenv/config').then(() => {
    runMigrations()
      .then(() => process.exit(0))
      .catch((err) => { console.error('[MIGRATE] Fatal:', err); process.exit(1); });
  });
}
