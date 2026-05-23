import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
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

app.use(errorHandler);

export default app;
