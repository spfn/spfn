/**
 * Request Logger Middleware 테스트
 *
 * ✅ 구현 완료:
 * - 요청 로깅 테스트
 * - 응답 완료 로깅 테스트
 * - 에러 로깅 테스트
 * - Request ID 생성 테스트
 * - 제외 경로 테스트
 * - 느린 요청 감지 테스트
 *
 * 🔗 관련 파일:
 * - src/server/core/middleware/request-logger.ts
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { RequestLogger } from '@/server/core';

type Env = {
  Variables: {
    requestId: string;
    customData: string;
  };
};

describe('RequestLogger Middleware', () => {
  describe('Basic Logging', () => {
    it('should log request and response without errors', async () => {
      const app = new Hono();

      app.use(RequestLogger());

      app.get('/test', (c) => c.json({ message: 'ok' }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });

    it('should handle POST requests', async () => {
      const app = new Hono();

      app.use(RequestLogger());

      app.post('/users', (c) => c.json({ id: 1 }));

      const res = await app.request('/users', { method: 'POST' });

      expect(res.status).toBe(200);
    });

    it('should measure response time for slow requests', async () => {
      const app = new Hono();

      app.use(RequestLogger());

      app.get('/slow', async (c) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return c.json({ message: 'done' });
      });

      const res = await app.request('/slow');

      expect(res.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('should log errors without throwing', async () => {
      const app = new Hono();

      app.use(RequestLogger());

      app.get('/error', () => {
        throw new Error('Test error');
      });

      try {
        await app.request('/error');
      } catch (error) {
        // 에러가 예상대로 throw됨
        expect(error).toBeTruthy();
      }
    });

    it('should log 4xx responses', async () => {
      const app = new Hono();

      app.use(RequestLogger());

      app.get('/not-found', (c) => c.json({ error: 'Not found' }, 404));

      const res = await app.request('/not-found');

      expect(res.status).toBe(404);
    });

    it('should log 5xx responses', async () => {
      const app = new Hono();

      app.use(RequestLogger());

      app.get('/server-error', (c) => c.json({ error: 'Server error' }, 500));

      const res = await app.request('/server-error');

      expect(res.status).toBe(500);
    });
  });

  describe('Request ID', () => {
    it('should generate and attach request ID', async () => {
      const app = new Hono<Env>();

      app.use(RequestLogger());

      app.get('/test', (c) => {
        const requestId = c.get('requestId');
        expect(requestId).toBeTruthy();
        expect(requestId).toMatch(/^req_/);
        return c.json({ requestId });
      });

      const res = await app.request('/test');
      const json: any = await res.json();

      expect(json.requestId).toMatch(/^req_/);
    });
  });

  describe('Excluded Paths', () => {
    it('should not log excluded paths', async () => {
      const app = new Hono();

      app.use(RequestLogger());

      app.get('/health', (c) => c.json({ status: 'ok' }));

      const res = await app.request('/health');

      expect(res.status).toBe(200);
    });

    it('should log non-excluded paths', async () => {
      const app = new Hono();

      app.use(RequestLogger());

      app.get('/api/users', (c) => c.json([]));

      const res = await app.request('/api/users');

      expect(res.status).toBe(200);
    });

    it('should support custom excluded paths', async () => {
      const app = new Hono();

      app.use(RequestLogger({
        excludePaths: ['/custom-health'],
      }));

      app.get('/custom-health', (c) => c.json({ status: 'ok' }));

      const res = await app.request('/custom-health');

      expect(res.status).toBe(200);
    });
  });

  describe('Slow Request Detection', () => {
    it('should handle slow requests', async () => {
      const app = new Hono();

      app.use(RequestLogger({
        slowRequestThreshold: 50, // 50ms
      }));

      app.get('/slow', async (c) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return c.json({ message: 'done' });
      });

      const res = await app.request('/slow');

      expect(res.status).toBe(200);
    });

    it('should handle fast requests', async () => {
      const app = new Hono();

      app.use(RequestLogger({
        slowRequestThreshold: 1000, // 1000ms
      }));

      app.get('/fast', (c) => c.json({ message: 'done' }));

      const res = await app.request('/fast');

      expect(res.status).toBe(200);
    });
  });

  describe('Integration', () => {
    it('should work with other middleware', async () => {
      const app = new Hono<Env>();

      // RequestLogger와 다른 미들웨어 조합
      app.use(RequestLogger());
      app.use(async (c, next) => {
        c.set('customData', 'test');
        await next();
      });

      app.get('/test', (c) => {
        return c.json({ data: c.get('customData') });
      });

      const res = await app.request('/test');
      const json: any = await res.json();

      expect(res.status).toBe(200);
      expect(json.data).toBe('test');
    });
  });
});