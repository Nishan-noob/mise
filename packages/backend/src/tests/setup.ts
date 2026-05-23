// Test setup: load env vars for tests
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://mise_user:mise_pass@localhost:5432/mise_test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-prod';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';
