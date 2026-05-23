import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool, withTransaction } from '../config/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { broadcast } from '../websocket/server';
import { WsOrderStatusChangedPayload } from '@mise/shared';

const router = Router();
router.use(authenticate);

const paymentSchema = z.object({
  method: z.enum(['cash', 'card', 'mobile', 'complimentary']),
  amount: z.number().positive(),
  reference: z.string().optional(),
});

router.post(
  '/orders/:orderId/pay',
  requireRole('admin', 'manager', 'cashier'),
  validate(paymentSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const orderId = Number(req.params.orderId);
    const { method, amount, reference } = req.body;

    const result = await withTransaction(async (client) => {
      const { rows: orderRows } = await client.query(
        `SELECT id, total, status FROM orders WHERE id=$1 FOR UPDATE`,
        [orderId]
      );
      if (!orderRows[0]) throw new Error('Order not found');
      if (orderRows[0].status === 'paid') throw new Error('Order already paid');
      if (orderRows[0].status === 'voided') throw new Error('Order is voided');

      const { rows: payment } = await client.query(
        `INSERT INTO payments (order_id, amount, method, reference, created_by)
         VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [orderId, amount, method, reference ?? null, req.user!.userId]
      );

      await client.query(
        `UPDATE orders SET status='paid', updated_at=NOW() WHERE id=$1`,
        [orderId]
      );

      await client.query(
        `UPDATE restaurant_tables rt SET status='available', updated_at=NOW()
         FROM orders o WHERE o.id=$1 AND rt.id=o.table_id`,
        [orderId]
      );

      await client.query(
        `INSERT INTO order_events (order_id, event_type, payload, user_id)
         VALUES($1,'payment_processed',$2::jsonb,$3)`,
        [orderId, JSON.stringify({ method, amount }), req.user!.userId]
      );

      return payment[0];
    });

    res.status(201).json({ success: true, data: result });

    broadcast<WsOrderStatusChangedPayload>('order:status_changed', {
      order_id: orderId,
      old_status: 'served',
      new_status: 'paid',
      updated_by: req.user!.userId,
    });
  }
);

router.get('/orders/:orderId', async (req, res: Response): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT p.*, u.name AS created_by_name FROM payments p
     LEFT JOIN users u ON u.id=p.created_by
     WHERE p.order_id=$1 ORDER BY p.created_at`,
    [req.params.orderId]
  );
  res.json({ success: true, data: rows });
});

export default router;
