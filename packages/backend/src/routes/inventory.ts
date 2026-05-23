import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool, withTransaction } from '../config/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { broadcast } from '../websocket/server';
import { WsInventoryLowStockPayload } from '@mise/shared';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res: Response): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT *, (quantity <= low_stock_threshold) AS is_low_stock
    FROM inventory_items ORDER BY name
  `);
  res.json({ success: true, data: rows });
});

router.get('/low-stock', async (_req, res: Response): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT *, true AS is_low_stock FROM inventory_items
    WHERE quantity <= low_stock_threshold ORDER BY name
  `);
  res.json({ success: true, data: rows });
});

router.get('/:id', async (req, res: Response): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT *, (quantity <= low_stock_threshold) AS is_low_stock FROM inventory_items WHERE id=$1`,
    [req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ success: false, error: 'Item not found' }); return; }
  res.json({ success: true, data: rows[0] });
});

router.get('/:id/transactions', async (req, res: Response): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT it.*, u.name AS created_by_name
    FROM inventory_transactions it
    LEFT JOIN users u ON u.id=it.created_by
    WHERE it.inventory_item_id=$1
    ORDER BY it.created_at DESC LIMIT 100
  `, [req.params.id]);
  res.json({ success: true, data: rows });
});

const restockSchema = z.object({
  inventory_item_id: z.number().int().positive(),
  quantity: z.number().positive(),
  reason: z.string().optional(),
});

router.post('/restock', requireRole('admin', 'manager'), validate(restockSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const { inventory_item_id, quantity, reason } = req.body;

  const item = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE inventory_items SET quantity=quantity+$1, updated_at=NOW() WHERE id=$2 RETURNING *, (quantity<=low_stock_threshold) AS is_low_stock`,
      [quantity, inventory_item_id]
    );
    if (!rows[0]) throw new Error('Item not found');

    await client.query(
      `INSERT INTO inventory_transactions (inventory_item_id, type, quantity, reason, created_by)
       VALUES ($1,'restock',$2,$3,$4)`,
      [inventory_item_id, quantity, reason ?? null, req.user!.userId]
    );
    return rows[0];
  });

  res.json({ success: true, data: item });
});

const adjustSchema = z.object({
  quantity: z.number(),
  reason: z.string().min(1),
  type: z.enum(['adjustment', 'waste']),
});

router.post('/:id/adjust', requireRole('admin', 'manager'), validate(adjustSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { quantity, reason, type } = req.body;

  const item = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE inventory_items SET quantity=GREATEST(0,quantity+$1), updated_at=NOW() WHERE id=$2
       RETURNING *, (quantity<=low_stock_threshold) AS is_low_stock`,
      [quantity, id]
    );
    if (!rows[0]) throw new Error('Item not found');

    await client.query(
      `INSERT INTO inventory_transactions (inventory_item_id, type, quantity, reason, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, type, Math.abs(quantity), reason, req.user!.userId]
    );

    return rows[0];
  });

  res.json({ success: true, data: item });

  if (item.is_low_stock) {
    broadcast<WsInventoryLowStockPayload>('inventory:low_stock', { item });
  }
});

const createItemSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number().nonnegative(),
  low_stock_threshold: z.number().nonnegative(),
});

router.post('/', requireRole('admin', 'manager'), validate(createItemSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const pool = getPool();
  const { name, unit, quantity, low_stock_threshold } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO inventory_items (name,unit,quantity,low_stock_threshold) VALUES($1,$2,$3,$4)
     RETURNING *,(quantity<=low_stock_threshold) AS is_low_stock`,
    [name, unit, quantity, low_stock_threshold]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

export default router;
