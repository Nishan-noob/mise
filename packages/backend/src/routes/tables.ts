import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { broadcast } from '../websocket/server';
import { WsTableStatusChangedPayload } from '@mise/shared';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res: Response): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT rt.*,
      (SELECT id FROM orders WHERE table_id=rt.id AND status NOT IN ('paid','voided','merged','served') ORDER BY created_at DESC LIMIT 1) AS active_order_id,
      (SELECT status FROM orders WHERE table_id=rt.id AND status NOT IN ('paid','voided','merged','served') ORDER BY created_at DESC LIMIT 1) AS active_order_status
    FROM restaurant_tables rt WHERE rt.active=true ORDER BY rt.floor, rt.name
  `);
  res.json({ success: true, data: rows });
});

router.get('/:id', async (req, res: Response): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT rt.*,
      (SELECT id FROM orders WHERE table_id=rt.id AND status NOT IN ('paid','voided','merged') ORDER BY created_at DESC LIMIT 1) AS active_order_id
    FROM restaurant_tables rt WHERE rt.id=$1
  `, [req.params.id]);
  if (!rows[0]) { res.status(404).json({ success: false, error: 'Table not found' }); return; }
  res.json({ success: true, data: rows[0] });
});

const statusSchema = z.object({
  status: z.enum(['available', 'occupied', 'reserved', 'cleaning']),
});

router.patch('/:id/status', requireRole('admin', 'manager', 'cashier'), validate(statusSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const pool = getPool();
  const { rows: old } = await pool.query('SELECT status FROM restaurant_tables WHERE id=$1', [req.params.id]);
  if (!old[0]) { res.status(404).json({ success: false, error: 'Table not found' }); return; }
  const { rows } = await pool.query(
    `UPDATE restaurant_tables SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
    [req.body.status, req.params.id]
  );
  res.json({ success: true, data: rows[0] });
  broadcast<WsTableStatusChangedPayload>('table:status_changed', {
    table_id: Number(req.params.id),
    old_status: old[0].status,
    new_status: req.body.status,
  });
});

const createTableSchema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().positive(),
  floor: z.string().min(1),
});

router.post('/', requireRole('admin', 'manager'), validate(createTableSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const pool = getPool();
  const { name, capacity, floor } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO restaurant_tables (name, capacity, floor) VALUES ($1,$2,$3) RETURNING *`,
    [name, capacity, floor]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

export default router;
