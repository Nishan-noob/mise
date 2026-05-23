import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { AuthPayload, WsEvent, WsEventType, WsSnapshotPayload } from '@mise/shared';
import { OrderService } from '../services/orderService';
import { getPool } from '../config/database';

interface AuthenticatedWs extends WebSocket {
  user?: AuthPayload;
  isAlive?: boolean;
}

let wss: WebSocketServer | null = null;

export function createWebSocketServer(server: HttpServer): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  // Heartbeat to detect dead connections
  const heartbeatInterval = setInterval(() => {
    wss!.clients.forEach((ws) => {
      const aws = ws as AuthenticatedWs;
      if (aws.isAlive === false) {
        aws.terminate();
        return;
      }
      aws.isAlive = false;
      aws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', async (ws: AuthenticatedWs, req) => {
    ws.isAlive = true;

    // Extract token from query string: ws://...?token=<jwt>
    const url = new URL(req.url || '', `ws://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'No token provided');
      return;
    }

    try {
      const secret = process.env.JWT_SECRET!;
      ws.user = jwt.verify(token, secret) as AuthPayload;
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WsEvent;
        if (msg.type === 'ping') {
          sendToClient(ws, 'pong', {});
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('error', (err) => console.error('[WS] Client error', err));

    // Send snapshot on connect for state resync
    try {
      const [open_orders, tables] = await Promise.all([
        OrderService.listOpen(),
        getPool().query(`
          SELECT rt.*,
            (SELECT id FROM orders WHERE table_id=rt.id AND status NOT IN ('paid','voided','merged','served') ORDER BY created_at DESC LIMIT 1) AS active_order_id,
            (SELECT status FROM orders WHERE table_id=rt.id AND status NOT IN ('paid','voided','merged','served') ORDER BY created_at DESC LIMIT 1) AS active_order_status
          FROM restaurant_tables rt WHERE rt.active=true ORDER BY rt.floor, rt.name
        `).then(r => r.rows),
      ]);

      sendToClient<WsSnapshotPayload>(ws, 'snapshot', { open_orders, tables });
    } catch (err) {
      console.error('[WS] Snapshot error', err);
    }
  });

  return wss;
}

function sendToClient<T>(ws: WebSocket, type: WsEventType, payload: T): void {
  if (ws.readyState === WebSocket.OPEN) {
    const event: WsEvent<T> = { type, payload, timestamp: new Date().toISOString() };
    ws.send(JSON.stringify(event));
  }
}

export function broadcast<T>(type: WsEventType, payload: T): void {
  if (!wss) return;
  const event: WsEvent<T> = { type, payload, timestamp: new Date().toISOString() };
  const data = JSON.stringify(event);

  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}
