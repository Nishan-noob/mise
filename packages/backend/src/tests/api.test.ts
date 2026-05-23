import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';

// Integration tests run against a real test DB (or mock if not available)
// These are smoke-level tests that verify API contract correctness

let authToken: string;

const DB_AVAILABLE = !!(process.env.DATABASE_URL && process.env.NODE_ENV !== 'test');

describe('Auth API', () => {
  it.skipIf(!DB_AVAILABLE)('POST /api/auth/login - returns 401 with bad credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'notexist@mise.local', password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/login - validates input format', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /health - returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Protected routes - unauthenticated', () => {
  it('GET /api/orders - returns 401 without token', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });

  it('GET /api/menu/items - returns 401 without token', async () => {
    const res = await request(app).get('/api/menu/items');
    expect(res.status).toBe(401);
  });

  it('GET /api/inventory - returns 401 without token', async () => {
    const res = await request(app).get('/api/inventory');
    expect(res.status).toBe(401);
  });
});

describe('Input validation', () => {
  it('POST /api/orders - returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ type: 'dine_in', items: [] });
    expect(res.status).toBe(401);
  });
});
