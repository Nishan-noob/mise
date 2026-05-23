import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getPool } from '../config/database';
import { validate } from '../middleware/validate';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', validate(loginSchema), async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;
  const pool = getPool();

  const { rows } = await pool.query(
    'SELECT id, name, email, password_hash, role, active FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  const user = rows[0];
  if (!user || !user.active) {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
    return;
  }

  const secret = process.env.JWT_SECRET!;
  const expiresIn = (process.env.JWT_EXPIRES_IN || '24h') as `${number}${'s'|'m'|'h'|'d'}`;
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    secret,
    { expiresIn }
  );

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
      },
    },
  });
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, name, email, role, active, created_at FROM users WHERE id = $1',
    [req.user!.userId]
  );
  if (!rows[0]) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  res.json({ success: true, data: rows[0] });
});

export default router;
