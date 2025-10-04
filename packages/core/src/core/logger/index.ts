/**
 * Logger Module
 *
 * 범용 로깅 모듈 - Adapter 패턴으로 구현체 교체 가능
 *
 * ✅ 구현 완료:
 * - Adapter 패턴 (Pino, Custom 지원)
 * - 환경변수로 Adapter 선택 가능
 * - Child logger 생성 지원
 * - 일관된 인터페이스 제공
 *
 * 💡 사용 예시:
 * ```typescript
 * import { logger } from '@/server/core/logger';
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
 *
 * 🔗 관련 파일:
 * - src/server/core/logger/adapters/pino.ts (Pino Adapter)
 * - src/server/core/logger/adapters/custom.ts (Custom Adapter)
 * - src/server/core/logger/adapters/types.ts (Adapter 인터페이스)
 */

import { PinoAdapter } from './adapters/pino';
import { CustomAdapter } from './adapters/custom';
import { getDefaultLogLevel } from './config';
import type { LoggerAdapter } from './adapters/types';

/**
 * Adapter 타입
 */
type AdapterType = 'pino' | 'custom';

/**
 * Adapter 생성
 */
function createAdapter(type: AdapterType): LoggerAdapter
{
    const level = getDefaultLogLevel();

    switch (type)
    {
        case 'pino':
            return new PinoAdapter({ level });

        case 'custom':
            return new CustomAdapter({ level });

        default:
            return new PinoAdapter({ level });
    }
}

/**
 * 환경변수에서 Adapter 타입 읽기
 */
function getAdapterType(): AdapterType
{
    const adapterEnv = process.env.LOGGER_ADAPTER as AdapterType;

    if (adapterEnv === 'custom' || adapterEnv === 'pino')
    {
        return adapterEnv;
    }

    // 기본값: pino
    return 'pino';
}

/**
 * 싱글톤 Logger 인스턴스
 */
export const logger: LoggerAdapter = createAdapter(getAdapterType());

/**
 * Re-export types
 */
export type { LogLevel } from './adapters/types';
export type { LoggerAdapter } from './adapters/types';