/**
 * Request Logger Middleware
 *
 * API 요청/응답 자동 로깅 미들웨어
 *
 * ✅ 구현 완료:
 * - 요청 시작/완료 자동 로깅
 * - 응답 시간 측정
 * - 에러 자동 로깅
 * - Request ID 생성 (분산 추적)
 * - 민감한 데이터 마스킹
 * - 제외 경로 설정 (헬스체크 등)
 *
 * 💡 특징:
 * - 모든 API 요청 자동 모니터링
 * - 성능 병목 파악
 * - 에러 추적 용이
 *
 * 💡 사용 예시:
 * ```typescript
 * import { RequestLogger } from '@/server/core';
 *
 * app.use(RequestLogger());
 * ```
 *
 * 🔗 관련 파일:
 * - src/logger/ (Logger)
 * - src/index.ts (Export)
 */

import type { Context, Next } from 'hono';
import { logger } from '../logger';

/**
 * Request Logger 설정
 */
export interface RequestLoggerConfig
{
    /**
     * 로깅에서 제외할 경로 (헬스체크 등)
     */
    excludePaths?: string[];

    /**
     * 민감한 데이터 마스킹할 필드명
     */
    sensitiveFields?: string[];

    /**
     * 느린 요청 임계값 (ms)
     */
    slowRequestThreshold?: number;
}

/**
 * 기본 설정
 */
const DEFAULT_CONFIG: Required<RequestLoggerConfig> = {
    excludePaths: ['/health', '/ping', '/favicon.ico'],
    sensitiveFields: ['password', 'token', 'apiKey', 'secret', 'authorization'],
    slowRequestThreshold: 1000, // 1초
};

/**
 * Request ID 생성
 */
function generateRequestId(): string
{
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 민감한 데이터 마스킹
 */
export function maskSensitiveData(obj: any, sensitiveFields: string[]): any
{
    if (!obj || typeof obj !== 'object') return obj;

    const masked = Array.isArray(obj) ? [...obj] : { ...obj };

    for (const key in masked)
    {
        const lowerKey = key.toLowerCase();

        // 민감한 필드면 마스킹
        if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase())))
        {
            masked[key] = '***MASKED***';
        }
        // 중첩 객체면 재귀적으로 마스킹
        else if (typeof masked[key] === 'object' && masked[key] !== null)
        {
            masked[key] = maskSensitiveData(masked[key], sensitiveFields);
        }
    }

    return masked;
}

/**
 * Request Logger 미들웨어
 */
export function RequestLogger(config?: RequestLoggerConfig)
{
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const apiLogger = logger.child('api');

    return async (c: Context, next: Next) =>
    {
        const path = new URL(c.req.url).pathname;

        // 제외 경로 체크
        if (cfg.excludePaths.includes(path))
        {
            return next();
        }

        // Request ID 생성 및 컨텍스트에 저장
        const requestId = generateRequestId();
        c.set('requestId', requestId);

        // 요청 정보 수집
        const method = c.req.method;
        const userAgent = c.req.header('user-agent');
        const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

        // 요청 시작 로그
        const startTime = Date.now();

        apiLogger.info('Request received', {
            requestId,
            method,
            path,
            ip,
            userAgent,
        });

        try
        {
            // 요청 처리
            await next();

            // 응답 완료
            const duration = Date.now() - startTime;
            const status = c.res.status;

            // 응답 완료 로그
            const logLevel = status >= 400 ? 'warn' : 'info';
            const isSlowRequest = duration >= cfg.slowRequestThreshold;

            apiLogger[logLevel]('Request completed', {
                requestId,
                method,
                path,
                status,
                duration,
                slow: isSlowRequest || undefined, // 느린 요청만 표시
            });

            // 느린 요청 경고
            if (isSlowRequest)
            {
                apiLogger.warn('Slow request detected', {
                    requestId,
                    method,
                    path,
                    duration,
                    threshold: cfg.slowRequestThreshold,
                });
            }
        }
        catch (error)
        {
            // 에러 발생
            const duration = Date.now() - startTime;

            apiLogger.error('Request failed', error as Error, {
                requestId,
                method,
                path,
                duration,
            });

            // 에러를 다시 던져서 에러 핸들러가 처리하도록
            throw error;
        }
    };
}