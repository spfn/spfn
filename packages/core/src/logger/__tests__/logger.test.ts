/**
 * Logger 테스트
 *
 * ✅ 구현 완료:
 * - 기본 로깅 테스트
 * - Child logger 테스트
 * - Error 로깅 테스트
 * - Context 로깅 테스트
 *
 * 💡 향후 고려사항:
 * - Transport별 테스트
 * - 로그 레벨 필터링 테스트
 * - 비동기 처리 테스트
 *
 * 🔗 관련 파일:
 * - src/server/core/logger/ (Logger 구현)
 */

import { describe, it, expect } from 'vitest';
import { logger } from '../index.js';

describe('Logger', () => {
  describe('Basic Logging', () => {
    it('should log debug message', () => {
      expect(() => {
        logger.debug('Debug message');
      }).not.toThrow();
    });

    it('should log info message', () => {
      expect(() => {
        logger.info('Info message');
      }).not.toThrow();
    });

    it('should log warn message', () => {
      expect(() => {
        logger.warn('Warn message');
      }).not.toThrow();
    });

    it('should log error message', () => {
      expect(() => {
        logger.error('Error message');
      }).not.toThrow();
    });

    it('should log fatal message', () => {
      expect(() => {
        logger.fatal('Fatal message');
      }).not.toThrow();
    });
  });

  describe('Context Logging', () => {
    it('should log with context', () => {
      expect(() => {
        logger.info('Message with context', {
          userId: 123,
          action: 'login',
        });
      }).not.toThrow();
    });

    it('should log with complex context', () => {
      expect(() => {
        logger.debug('Complex context', {
          user: { id: 1, name: 'Test' },
          metadata: { timestamp: Date.now() },
          tags: ['test', 'debug'],
        });
      }).not.toThrow();
    });
  });

  describe('Error Logging', () => {
    it('should log error with Error object', () => {
      const error = new Error('Test error');

      expect(() => {
        logger.error('Error occurred', error);
      }).not.toThrow();
    });

    it('should log error with Error object and context', () => {
      const error = new Error('Test error with context');

      expect(() => {
        logger.error('Error occurred', error, {
          userId: 456,
          operation: 'test',
        });
      }).not.toThrow();
    });

    it('should log fatal with Error object', () => {
      const error = new Error('Fatal error');

      expect(() => {
        logger.fatal('Fatal error occurred', error);
      }).not.toThrow();
    });
  });

  describe('Child Logger', () => {
    it('should create child logger', () => {
      const dbLogger = logger.child('database');

      expect(() => {
        dbLogger.info('Database connected');
      }).not.toThrow();
    });

    it('should create multiple child loggers', () => {
      const dbLogger = logger.child('database');
      const apiLogger = logger.child('api');

      expect(() => {
        dbLogger.debug('DB query executed');
        apiLogger.info('API request received');
      }).not.toThrow();
    });

    it('should log with child logger and context', () => {
      const dbLogger = logger.child('database');

      expect(() => {
        dbLogger.warn('Connection retry', { attempt: 3 });
      }).not.toThrow();
    });
  });

  describe('Real-world Scenarios', () => {
    it('should log database connection', () => {
      const dbLogger = logger.child('database');

      expect(() => {
        dbLogger.info('Connecting to database...');
        dbLogger.info('Database connected successfully');
      }).not.toThrow();
    });

    it('should log API request', () => {
      const apiLogger = logger.child('api');

      expect(() => {
        apiLogger.info('Request received', {
          method: 'POST',
          path: '/users',
          ip: '127.0.0.1',
        });
      }).not.toThrow();
    });

    it('should log connection retry with error', () => {
      const dbLogger = logger.child('database');
      const error = new Error('Connection timeout');

      expect(() => {
        dbLogger.warn('Connection failed, retrying...', error, {
          attempt: 1,
          maxRetries: 3,
          delay: 1000,
        });
      }).not.toThrow();
    });

    it('should log fatal system error', () => {
      const sysLogger = logger.child('system');
      const error = new Error('Out of memory');

      expect(() => {
        sysLogger.fatal('System critical error', error, {
          memoryUsage: process.memoryUsage(),
        });
      }).not.toThrow();
    });
  });
});