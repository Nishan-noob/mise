import 'dotenv/config';
import app from './app';
import { createWebSocketServer } from './websocket/server';
import http from 'http';
import { getPool } from './config/database';
import { runMigrations } from './db/migrate';
import { runSeed } from './db/seed';

const PORT = parseInt(process.env.PORT || '4000', 10);

const server = http.createServer(app);
createWebSocketServer(server);

async function start() {
  const pool = getPool();
  try {
    await pool.query('SELECT 1');
    console.log('[DB] Connected to PostgreSQL');
  } catch (err) {
    console.error('[DB] Failed to connect:', err);
    process.exit(1);
  }

  // Auto-run migrations + seed in production so Railway/Render applies schema on first boot
  if (process.env.NODE_ENV === 'production') {
    try {
      await runMigrations();
      console.log('[DB] Migrations up to date');
    } catch (err) {
      console.error('[DB] Migration failed:', err);
      process.exit(1);
    }
    try {
      await runSeed();
      console.log('[DB] Seed up to date');
    } catch (err) {
      // Seed failure is non-fatal — schema is more important than demo data
      console.error('[DB] Seed warning:', err);
    }
  }

  server.listen(PORT, () => {
    console.log(`[SERVER] Mise backend running on http://localhost:${PORT}`);
    console.log(`[WS] WebSocket server ready on ws://localhost:${PORT}`);
  });
}

start();

process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED]', err);
  process.exit(1);
});
