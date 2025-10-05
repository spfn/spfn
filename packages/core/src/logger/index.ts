/**
 * Logger Module Exports
 *
 * 로거 모듈의 진입점 (Pure re-export only)
 *
 * 💡 사용 예시:
 * ```typescript
 * import { logger } from '@spfn/core';
 *
 * // 기본 사용
 * logger.info('Application started');
 * logger.error('Connection failed', error);
 *
 * // 모듈별 logger 생성
 * const dbLogger = logger.child('database');
 * dbLogger.debug('Connecting to database...');
 *
 * // Context 추가
 * logger.warn('Retry attempt', { attempt: 3, delay: 1000 });
 * ```
 *
 * 💡 Adapter 교체:
 * - 환경변수: LOGGER_ADAPTER=pino (기본) 또는 custom
 * - Pino: 고성능, 프로덕션 검증됨
 * - Custom: 완전한 제어, Pino 의존성 없음
 */

// Logger Instance
export { logger } from './adapter-factory.js';

// Types
export type { LogLevel, LoggerAdapter } from './adapters/types.js';