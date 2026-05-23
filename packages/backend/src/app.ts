import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import authRouter from './routes/auth';
import menuRouter from './routes/menu';
import ordersRouter from './routes/orders';
import tablesRouter from './routes/tables';
import inventoryRouter from './routes/inventory';
import analyticsRouter from './routes/analytics';
import usersRouter from './routes/users';
import shiftsRouter from './routes/shifts';
import paymentsRouter from './routes/payments';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const isProd = process.env.NODE_ENV === 'production';

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use(helmet({ contentSecurityPolicy: false }));
// In production the frontend is served from the same origin — no CORS needed for browser requests.
// Keep CORS active only in development.
if (!isProd) {
  app.use(cors({ origin: corsOrigin, credentials: true }));
} else {
  app.use(cors({ origin: true, credentials: true }));
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mise-backend', ts: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/menu', menuRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/tables', tablesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/users', usersRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/payments', paymentsRouter);

// ─── Serve frontend in production ────────────────────────────────────────────
if (isProd) {
  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    // SPA fallback — all non-API routes return index.html
    app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }
}

app.use(errorHandler);

export default app;
