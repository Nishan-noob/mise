import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getPool } from '../config/database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate);

router.get('/', requireRole('admin', 'manager'), async (_req, res: Response): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, name, email, role, active, created_at FROM users ORDER BY name'
  );
  res.json({ success: true, data: rows });
});

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'manager', 'cashier', 'kitchen']),
});

router.post('/', requireRole('admin'), validate(createUserSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const pool = getPool();
  const { name, email, password, role } = req.body;
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
  const hash = await bcrypt.hash(password, rounds);

  const { rows } = await pool.query(
    `INSERT INTO users (name,email,password_hash,role) VALUES($1,$2,$3,$4)
     RETURNING id,name,email,role,active,created_at`,
    [name, email.toLowerCase(), hash, role]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(['admin', 'manager', 'cashier', 'kitchen']).optional(),
  active: z.boolean().optional(),
});

router.patch('/:id', requireRole('admin'), validate(updateUserSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const pool = getPool();
  const allowed = ['name', 'role', 'active'];
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      values.push(req.body[key]);
      updates.push(`${key}=$${values.length}`);
    }
  }

  if (!updates.length) { res.status(400).json({ success: false, error: 'Nothing to update' }); return; }
  values.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE users SET ${updates.join(',')},updated_at=NOW() WHERE id=$${values.length}
     RETURNING id,name,email,role,active,created_at`,
    values
  );
  if (!rows[0]) { res.status(404).json({ success: false, error: 'User not found' }); return; }
  res.json({ success: true, data: rows[0] });
});

export default router;
