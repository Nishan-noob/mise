import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate);

router.get('/', requireRole('admin', 'manager'), async (_req, res: Response): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT s.*, u.name AS user_name FROM shifts s
    JOIN users u ON u.id=s.user_id
    ORDER BY s.start_time DESC LIMIT 50
  `);
  res.json({ success: true, data: rows });
});

router.post('/start', async (req: AuthRequest, res: Response): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO shifts (user_id) VALUES($1) RETURNING *`,
    [req.user!.userId]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

router.post('/:id/end', async (req: AuthRequest, res: Response): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE shifts SET end_time=NOW() WHERE id=$1 AND user_id=$2 AND end_time IS NULL RETURNING *`,
    [req.params.id, req.user!.userId]
  );
  if (!rows[0]) { res.status(404).json({ success: false, error: 'Shift not found or already ended' }); return; }
  res.json({ success: true, data: rows[0] });
});

export default router;
