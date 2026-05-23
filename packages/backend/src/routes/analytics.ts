import { Router, Response } from 'express';
import { getPool } from '../config/database';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/summary', async (req, res: Response): Promise<void> => {
  const pool = getPool();
  const { date_from, date_to } = req.query;

  const from = (date_from as string) || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const to = (date_to as string) || new Date().toISOString();

  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status NOT IN ('voided','draft')) AS total_orders,
      COALESCE(SUM(total) FILTER (WHERE status='paid'), 0) AS total_revenue,
      COALESCE(AVG(total) FILTER (WHERE status='paid'), 0) AS avg_order_value,
      COALESCE(SUM(
        (SELECT SUM(quantity) FROM order_items WHERE order_id=o.id AND status!='voided')
      ) FILTER (WHERE status='paid'), 0) AS total_items_sold,
      COUNT(*) FILTER (WHERE status='paid') AS paid_orders,
      COUNT(*) FILTER (WHERE status='voided') AS voided_orders,
      $1::text AS period_start,
      $2::text AS period_end
    FROM orders o
    WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
  `, [from, to]);

  res.json({ success: true, data: rows[0] });
});

router.get('/items', async (req, res: Response): Promise<void> => {
  const pool = getPool();
  const { date_from, date_to } = req.query;
  const from = (date_from as string) || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const to = (date_to as string) || new Date().toISOString();

  const { rows } = await pool.query(`
    SELECT
      mi.id AS menu_item_id,
      mi.name,
      mc.name AS category,
      mc.station,
      SUM(oi.quantity) AS quantity_sold,
      SUM(oi.unit_price * oi.quantity) AS revenue
    FROM order_items oi
    JOIN orders o ON o.id=oi.order_id
    JOIN menu_items mi ON mi.id=oi.menu_item_id
    JOIN menu_categories mc ON mc.id=mi.category_id
    WHERE o.status='paid'
      AND o.created_at BETWEEN $1::timestamptz AND $2::timestamptz
      AND oi.status != 'voided'
    GROUP BY mi.id, mi.name, mc.name, mc.station
    ORDER BY revenue DESC
  `, [from, to]);

  res.json({ success: true, data: rows });
});

router.get('/hourly', async (req, res: Response): Promise<void> => {
  const pool = getPool();
  const { date } = req.query;
  const day = (date as string) || new Date().toISOString().slice(0, 10);

  const { rows } = await pool.query(`
    SELECT
      EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') AS hour,
      COUNT(*) AS order_count,
      COALESCE(SUM(total),0) AS revenue
    FROM orders
    WHERE status='paid'
      AND created_at::date = $1::date
    GROUP BY hour
    ORDER BY hour
  `, [day]);

  res.json({ success: true, data: rows });
});

router.get('/staff', async (req, res: Response): Promise<void> => {
  const pool = getPool();
  const { date_from, date_to } = req.query;
  const from = (date_from as string) || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const to = (date_to as string) || new Date().toISOString();

  const { rows } = await pool.query(`
    SELECT
      u.id AS user_id,
      u.name,
      u.role,
      COUNT(o.id) AS orders_created,
      COALESCE(SUM(o.total) FILTER (WHERE o.status='paid'), 0) AS total_revenue
    FROM users u
    LEFT JOIN orders o ON o.created_by=u.id
      AND o.created_at BETWEEN $1::timestamptz AND $2::timestamptz
    GROUP BY u.id, u.name, u.role
    ORDER BY total_revenue DESC
  `, [from, to]);

  res.json({ success: true, data: rows });
});

router.get('/export/csv', async (req, res: Response): Promise<void> => {
  const pool = getPool();
  const { date } = req.query;
  const day = (date as string) || new Date().toISOString().slice(0, 10);

  const { rows } = await pool.query(`
    SELECT
      o.id,
      o.type,
      o.status,
      rt.name AS table_name,
      o.customer_name,
      o.subtotal,
      o.discount_amount,
      o.service_charge_amount,
      o.tax_amount,
      o.total,
      u.name AS cashier,
      o.created_at
    FROM orders o
    LEFT JOIN restaurant_tables rt ON rt.id=o.table_id
    LEFT JOIN users u ON u.id=o.created_by
    WHERE o.created_at::date = $1::date
    ORDER BY o.created_at
  `, [day]);

  const headers = ['id', 'type', 'status', 'table', 'customer', 'subtotal', 'discount', 'service_charge', 'tax', 'total', 'cashier', 'created_at'];
  const csv = [
    headers.join(','),
    ...rows.map((r) =>
      [r.id, r.type, r.status, r.table_name || '', r.customer_name || '', r.subtotal, r.discount_amount, r.service_charge_amount, r.tax_amount, r.total, r.cashier, r.created_at].join(',')
    ),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="sales-${day}.csv"`);
  res.send(csv);
});

export default router;
