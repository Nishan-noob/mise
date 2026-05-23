import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate);

// GET /api/menu/categories
router.get('/categories', async (_req, res: Response): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM menu_categories ORDER BY sort_order, name'
  );
  res.json({ success: true, data: rows });
});

// GET /api/menu/items
router.get('/items', async (req, res: Response): Promise<void> => {
  const pool = getPool();
  const { category_id, active } = req.query;
  let sql = `
    SELECT mi.*, mc.name AS category_name, mc.station
    FROM menu_items mi
    JOIN menu_categories mc ON mc.id = mi.category_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (category_id) {
    params.push(category_id);
    sql += ` AND mi.category_id = $${params.length}`;
  }
  if (active !== undefined) {
    params.push(active === 'true');
    sql += ` AND mi.active = $${params.length}`;
  }
  sql += ' ORDER BY mc.sort_order, mi.name';

  const { rows } = await pool.query(sql, params);
  res.json({ success: true, data: rows });
});

// GET /api/menu/items/:id (with modifiers)
router.get('/items/:id', async (req, res: Response): Promise<void> => {
  const pool = getPool();
  const { id } = req.params;

  const { rows: items } = await pool.query(
    `SELECT mi.*, mc.name AS category_name, mc.station
     FROM menu_items mi
     JOIN menu_categories mc ON mc.id = mi.category_id
     WHERE mi.id = $1`,
    [id]
  );

  if (!items[0]) {
    res.status(404).json({ success: false, error: 'Item not found' });
    return;
  }

  const { rows: groups } = await pool.query(
    'SELECT * FROM modifier_groups WHERE menu_item_id = $1 ORDER BY sort_order',
    [id]
  );

  for (const group of groups) {
    const { rows: mods } = await pool.query(
      'SELECT * FROM modifiers WHERE modifier_group_id = $1 AND active = true',
      [group.id]
    );
    group.modifiers = mods;
  }

  items[0].modifier_groups = groups;
  res.json({ success: true, data: items[0] });
});

const itemSchema = z.object({
  category_id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  price: z.number().nonnegative(),
  image_url: z.string().url().nullable().optional(),
  active: z.boolean().optional(),
});

// POST /api/menu/items
router.post('/items', requireRole('admin', 'manager'), validate(itemSchema), async (req, res: Response): Promise<void> => {
  const pool = getPool();
  const { category_id, name, description, price, image_url, active } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO menu_items (category_id, name, description, price, image_url, active)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [category_id, name, description ?? null, price, image_url ?? null, active ?? true]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

// PATCH /api/menu/items/:id
router.patch('/items/:id', requireRole('admin', 'manager'), async (req, res: Response): Promise<void> => {
  const pool = getPool();
  const { id } = req.params;
  const allowed = ['name', 'description', 'price', 'image_url', 'active', 'category_id'];
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      values.push(req.body[key]);
      updates.push(`${key} = $${values.length}`);
    }
  }

  if (updates.length === 0) {
    res.status(400).json({ success: false, error: 'No valid fields to update' });
    return;
  }

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE menu_items SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
    values
  );

  if (!rows[0]) {
    res.status(404).json({ success: false, error: 'Item not found' });
    return;
  }
  res.json({ success: true, data: rows[0] });
});

export default router;
