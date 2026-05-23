import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { getPool } from '../config/database';

export async function runSeed() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    // ── Seed demo users (programmatic hash — avoids cross-platform bcrypt issues) ──
    const hash = await bcrypt.hash('password', 10);
    await client.query(`
      INSERT INTO users (name, email, password_hash, role) VALUES
        ('Admin',       'admin@mise.local',   $1, 'admin'),
        ('Morgan Lee',  'manager@mise.local', $1, 'manager'),
        ('Casey Kim',   'cashier@mise.local', $1, 'cashier'),
        ('Jordan Chen', 'kitchen@mise.local', $1, 'kitchen')
      ON CONFLICT (email) DO UPDATE SET password_hash = $1, active = TRUE
    `, [hash]);
    console.log('[SEED] ✓ Demo users upserted');

    // ── Seed the rest (tables, menu, inventory) from the SQL file ──
    const migrationsDir = fs.existsSync(path.join(__dirname, 'migrations'))
      ? path.join(__dirname, 'migrations')
      : path.join(__dirname, '../../src/db/migrations');
    const sql = fs.readFileSync(path.join(migrationsDir, '002_seed.sql'), 'utf8');
    await client.query(sql);
    console.log('[SEED] ✓ Menu / tables / inventory seed applied');
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
