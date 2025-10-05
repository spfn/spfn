/**
 * Logger Adapter Factory
 *
 * Adapter 생성 및 초기화 로직
 */

import { PinoAdapter } from './adapters/pino.js';
import { CustomAdapter } from './adapters/custom.js';
import { getDefaultLogLevel } from './config.js';
import type { LoggerAdapter } from './adapters/types.js';

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