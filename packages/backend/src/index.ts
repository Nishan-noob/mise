import 'dotenv/config';
import app from './app';
import { createWebSocketServer } from './websocket/server';
import http from 'http';
import { getPool } from './config/database';

const PORT = parseInt(process.env.PORT || '4000', 10);

const server = http.createServer(app);
createWebSocketServer(server);

async function start() {
  // Verify DB connection
  const pool = getPool();
  try {
    await pool.query('SELECT 1');
    console.log('[DB] Connected to PostgreSQL');
  } catch (err) {
    console.error('[DB] Failed to connect:', err);
    process.exit(1);
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
