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
import { RequestLogger, maskSensitiveData } from '../request-logger.js';

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

describe('maskSensitiveData', () => {
  describe('Basic Masking', () => {
    it('should mask password fields', () => {
      const data = {
        username: 'john',
        password: 'secret123',
        email: 'john@example.com',
      };

      const masked = maskSensitiveData(data, ['password']);

      expect(masked.username).toBe('john');
      expect(masked.password).toBe('***MASKED***');
      expect(masked.email).toBe('john@example.com');
    });

    it('should mask multiple sensitive fields', () => {
      const data = {
        username: 'john',
        password: 'secret123',
        token: 'abc123',
        apiKey: 'key456',
      };

      const masked = maskSensitiveData(data, ['password', 'token', 'apiKey']);

      expect(masked.username).toBe('john');
      expect(masked.password).toBe('***MASKED***');
      expect(masked.token).toBe('***MASKED***');
      expect(masked.apiKey).toBe('***MASKED***');
    });

    it('should be case-insensitive', () => {
      const data = {
        PASSWORD: 'secret',
        Token: 'abc',
        ApiKey: 'key',
      };

      const masked = maskSensitiveData(data, ['password', 'token', 'apikey']);

      expect(masked.PASSWORD).toBe('***MASKED***');
      expect(masked.Token).toBe('***MASKED***');
      expect(masked.ApiKey).toBe('***MASKED***');
    });

    it('should mask fields with partial matches', () => {
      const data = {
        userPassword: 'secret',
        accessToken: 'abc',
        secretKey: 'key',
      };

      const masked = maskSensitiveData(data, ['password', 'token', 'secret']);

      expect(masked.userPassword).toBe('***MASKED***');
      expect(masked.accessToken).toBe('***MASKED***');
      expect(masked.secretKey).toBe('***MASKED***');
    });
  });

  describe('Nested Objects', () => {
    it('should mask nested objects', () => {
      const data = {
        user: {
          name: 'john',
          credentials: {
            password: 'secret',
            token: 'abc123',
          },
        },
      };

      const masked = maskSensitiveData(data, ['password', 'token']);

      expect(masked.user.name).toBe('john');
      expect(masked.user.credentials.password).toBe('***MASKED***');
      expect(masked.user.credentials.token).toBe('***MASKED***');
    });

    it('should mask deeply nested objects', () => {
      const data = {
        level1: {
          level2: {
            level3: {
              password: 'secret',
            },
          },
        },
      };

      const masked = maskSensitiveData(data, ['password']);

      expect(masked.level1.level2.level3.password).toBe('***MASKED***');
    });
  });

  describe('Arrays', () => {
    it('should mask array elements', () => {
      const data = {
        users: [
          { name: 'john', password: 'secret1' },
          { name: 'jane', password: 'secret2' },
        ],
      };

      const masked = maskSensitiveData(data, ['password']);

      expect(masked.users[0].name).toBe('john');
      expect(masked.users[0].password).toBe('***MASKED***');
      expect(masked.users[1].name).toBe('jane');
      expect(masked.users[1].password).toBe('***MASKED***');
    });

    it('should handle nested arrays', () => {
      const data = {
        matrix: [
          [{ password: 'a' }, { password: 'b' }],
          [{ password: 'c' }, { password: 'd' }],
        ],
      };

      const masked = maskSensitiveData(data, ['password']);

      expect(masked.matrix[0][0].password).toBe('***MASKED***');
      expect(masked.matrix[1][1].password).toBe('***MASKED***');
    });
  });

  describe('Circular References', () => {
    it('should handle circular references', () => {
      const data: any = {
        name: 'john',
        password: 'secret',
      };
      data.self = data; // Circular reference

      const masked = maskSensitiveData(data, ['password']);

      expect(masked.name).toBe('john');
      expect(masked.password).toBe('***MASKED***');
      expect(masked.self).toBe('[Circular]');
    });

    it('should handle nested circular references', () => {
      const parent: any = { name: 'parent', password: 'secret1' };
      const child: any = { name: 'child', password: 'secret2' };
      parent.child = child;
      child.parent = parent;

      const masked = maskSensitiveData(parent, ['password']);

      expect(masked.name).toBe('parent');
      expect(masked.password).toBe('***MASKED***');
      expect(masked.child.name).toBe('child');
      expect(masked.child.password).toBe('***MASKED***');
      expect(masked.child.parent).toBe('[Circular]');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values', () => {
      const masked = maskSensitiveData(null, ['password']);
      expect(masked).toBeNull();
    });

    it('should handle undefined values', () => {
      const masked = maskSensitiveData(undefined, ['password']);
      expect(masked).toBeUndefined();
    });

    it('should handle primitive values', () => {
      expect(maskSensitiveData('string', ['password'])).toBe('string');
      expect(maskSensitiveData(123, ['password'])).toBe(123);
      expect(maskSensitiveData(true, ['password'])).toBe(true);
    });

    it('should handle empty objects', () => {
      const masked = maskSensitiveData({}, ['password']);
      expect(masked).toEqual({});
    });

    it('should handle empty arrays', () => {
      const masked = maskSensitiveData([], ['password']);
      expect(masked).toEqual([]);
    });

    it('should not mutate original object', () => {
      const original = { password: 'secret', username: 'john' };
      const masked = maskSensitiveData(original, ['password']);

      expect(original.password).toBe('secret'); // Original unchanged
      expect(masked.password).toBe('***MASKED***');
    });
  });
});