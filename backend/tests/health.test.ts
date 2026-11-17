import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';

describe('Health and Readiness Checks', () => {
  describe('GET /health', () => {
    it('returns 200 with status ok (liveness check, no DB call)', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /ready', () => {
    beforeAll(async () => {
      await connectDB();
    });

    afterAll(async () => {
      await disconnectDB();
    });

    it('returns 200 with status ready against test database', async () => {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ready',
        database: 'connected',
      });
    });
  });
});
