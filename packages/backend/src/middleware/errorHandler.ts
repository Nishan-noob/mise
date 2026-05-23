import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[ERROR]', err);

  if (err instanceof Error) {
    // Postgres constraint violations
    const pgErr = err as NodeJS.ErrnoException & { code?: string; constraint?: string };
    if (pgErr.code === '23505') {
      res.status(409).json({ success: false, error: 'Duplicate entry' });
      return;
    }
    if (pgErr.code === '23503') {
      res.status(400).json({ success: false, error: 'Referenced record does not exist' });
      return;
    }
  }

  res.status(500).json({ success: false, error: 'Internal server error' });
}
