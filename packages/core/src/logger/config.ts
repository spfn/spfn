/**
 * Logger Configuration
 *
 * 로거 설정 (환경별)
 *
 * ✅ 구현 완료:
 * - 환경별 로그 레벨 설정
 * - Console Transport 설정
 * - File Transport 설정 (자체 구축용)
 * - 파일 로테이션 설정
 * - Slack Transport 설정 (환경변수 기반)
 * - Email Transport 설정 (환경변수 기반)
 *
 * 💡 배포 시나리오:
 * - K8s: 파일 로깅 비활성화 (Stdout만)
 * - 자체 구축: LOGGER_FILE_ENABLED=true
 *
 * 🔗 관련 파일:
 * - src/logger/types.ts (타입 정의)
 * - src/logger/index.ts (메인 export)
 * - .env.local (환경변수)
 */

import type {
    LogLevel,
    ConsoleTransportConfig,
    FileTransportConfig,
    SlackTransportConfig,
    EmailTransportConfig,
} from './types';

/**
 * 파일 로깅 활성화 여부 (자체 구축용)
 */
export function isFileLoggingEnabled(): boolean
{
    return process.env.LOGGER_FILE_ENABLED === 'true';
}

/**
 * 환경별 기본 로그 레벨
 */
export function getDefaultLogLevel(): LogLevel
{
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (isDevelopment)
    {
        return 'debug';
    }

    if (isProduction)
    {
        return 'info';
    }

    // test 환경
    return 'warn';
}

/**
 * Console Transport 설정
 */
export function getConsoleConfig(): ConsoleTransportConfig
{
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        level: 'debug',
        enabled: true,
        colorize: !isProduction, // 개발: 컬러 출력, 프로덕션: 플레인 텍스트
    };
}

/**
 * File Transport 설정
 */
export function getFileConfig(): FileTransportConfig
{
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        level: 'info',
        enabled: isProduction, // 프로덕션에서만 파일 로깅
        logDir: process.env.LOG_DIR || './logs',
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
    };
}

/**
 * Slack Transport 설정
 */
export function getSlackConfig(): SlackTransportConfig | null
{
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl)
    {
        return null; // 설정되지 않으면 비활성화
    }

    const isProduction = process.env.NODE_ENV === 'production';

    return {
        level: 'error', // error 이상만 Slack 전송
        enabled: isProduction, // 프로덕션에서만 활성화
        webhookUrl,
        channel: process.env.SLACK_CHANNEL,
        username: process.env.SLACK_USERNAME || 'Logger Bot',
    };
}

/**
 * Email Transport 설정
 */
export function getEmailConfig(): EmailTransportConfig | null
{
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const emailFrom = process.env.EMAIL_FROM;
    const emailTo = process.env.EMAIL_TO;

    // 필수 설정이 없으면 비활성화
    if (!smtpHost || !smtpPort || !emailFrom || !emailTo)
    {
        return null;
    }

    const isProduction = process.env.NODE_ENV === 'production';

    return {
        level: 'fatal', // fatal 레벨만 이메일 전송
        enabled: isProduction, // 프로덕션에서만 활성화
        from: emailFrom,
        to: emailTo.split(',').map(email => email.trim()),
        smtpHost,
        smtpPort: parseInt(smtpPort, 10),
        smtpUser: process.env.SMTP_USER,
        smtpPassword: process.env.SMTP_PASSWORD,
    };
}