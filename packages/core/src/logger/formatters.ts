/**
 * Logger Formatters
 *
 * 로그 포맷팅 유틸리티
 *
 * ✅ 구현 완료:
 * - 컬러 포맷터 (콘솔 출력용)
 * - JSON 포맷터 (파일/전송용)
 * - 타임스탬프 포맷터
 * - 에러 스택 트레이스 포맷팅
 *
 * 🔗 관련 파일:
 * - src/logger/types.ts (타입 정의)
 * - src/logger/transports/ (Transport 구현체)
 */

import type { LogLevel, LogMetadata } from './types';

/**
 * ANSI 컬러 코드
 */
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',

    // 로그 레벨 컬러
    debug: '\x1b[36m',    // cyan
    info: '\x1b[32m',     // green
    warn: '\x1b[33m',     // yellow
    error: '\x1b[31m',    // red
    fatal: '\x1b[35m',    // magenta

    // 추가 컬러
    gray: '\x1b[90m',
};

/**
 * 로그 레벨을 컬러 문자열로 변환
 */
export function colorizeLevel(level: LogLevel): string
{
    const color = COLORS[level];
    const levelStr = level.toUpperCase().padEnd(5);
    return `${color}${levelStr}${COLORS.reset}`;
}

/**
 * 타임스탬프 포맷 (ISO 8601)
 */
export function formatTimestamp(date: Date): string
{
    return date.toISOString();
}

/**
 * 타임스탬프 포맷 (사람이 읽기 쉬운 형식)
 */
export function formatTimestampHuman(date: Date): string
{
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * 에러 객체를 문자열로 변환 (스택 트레이스 포함)
 */
export function formatError(error: Error): string
{
    const lines: string[] = [];

    lines.push(`${error.name}: ${error.message}`);

    if (error.stack)
    {
        const stackLines = error.stack.split('\n').slice(1);
        lines.push(...stackLines);
    }

    return lines.join('\n');
}

/**
 * Context 객체를 문자열로 변환
 */
export function formatContext(context: Record<string, unknown>): string
{
    try
    {
        return JSON.stringify(context, null, 2);
    }
    catch (error)
    {
        return '[Context serialization failed]';
    }
}

/**
 * 콘솔용 컬러 포맷
 */
export function formatConsole(metadata: LogMetadata, colorize = true): string
{
    const parts: string[] = [];

    // 타임스탬프
    const timestamp = formatTimestampHuman(metadata.timestamp);
    if (colorize)
    {
        parts.push(`${COLORS.gray}${timestamp}${COLORS.reset}`);
    }
    else
    {
        parts.push(timestamp);
    }

    // 로그 레벨
    if (colorize)
    {
        parts.push(colorizeLevel(metadata.level));
    }
    else
    {
        parts.push(metadata.level.toUpperCase().padEnd(5));
    }

    // 모듈명
    if (metadata.module)
    {
        if (colorize)
        {
            parts.push(`${COLORS.dim}[${metadata.module}]${COLORS.reset}`);
        }
        else
        {
            parts.push(`[${metadata.module}]`);
        }
    }

    // 메시지
    parts.push(metadata.message);

    let output = parts.join(' ');

    // Context 추가
    if (metadata.context && Object.keys(metadata.context).length > 0)
    {
        output += '\n' + formatContext(metadata.context);
    }

    // 에러 추가
    if (metadata.error)
    {
        output += '\n' + formatError(metadata.error);
    }

    return output;
}

/**
 * JSON 포맷 (파일 저장 및 전송용)
 */
export function formatJSON(metadata: LogMetadata): string
{
    const obj: Record<string, unknown> = {
        timestamp: formatTimestamp(metadata.timestamp),
        level: metadata.level,
        message: metadata.message,
    };

    if (metadata.module)
    {
        obj.module = metadata.module;
    }

    if (metadata.context)
    {
        obj.context = metadata.context;
    }

    if (metadata.error)
    {
        obj.error = {
            name: metadata.error.name,
            message: metadata.error.message,
            stack: metadata.error.stack,
        };
    }

    return JSON.stringify(obj);
}

/**
 * Slack 메시지 포맷
 */
export function formatSlack(metadata: LogMetadata): string
{
    const emoji = {
        debug: ':bug:',
        info: ':information_source:',
        warn: ':warning:',
        error: ':x:',
        fatal: ':fire:',
    };

    const parts: string[] = [];

    parts.push(`${emoji[metadata.level]} *${metadata.level.toUpperCase()}*`);

    if (metadata.module)
    {
        parts.push(`\`[${metadata.module}]\``);
    }

    parts.push(metadata.message);

    let message = parts.join(' ');

    if (metadata.context)
    {
        message += '\n```\n' + JSON.stringify(metadata.context, null, 2) + '\n```';
    }

    if (metadata.error)
    {
        message += '\n```\n' + formatError(metadata.error) + '\n```';
    }

    return message;
}

/**
 * Email 제목 생성
 */
export function formatEmailSubject(metadata: LogMetadata): string
{
    const prefix = `[${metadata.level.toUpperCase()}]`;
    const module = metadata.module ? `[${metadata.module}]` : '';

    return `${prefix}${module} ${metadata.message}`;
}

/**
 * Email 본문 생성 (HTML)
 */
export function formatEmailBody(metadata: LogMetadata): string
{
    const parts: string[] = [];

    parts.push('<html>');
    parts.push('<body style="font-family: monospace; padding: 20px;">');

    // 헤더
    parts.push(`<h2 style="color: ${getEmailColor(metadata.level)};">`);
    parts.push(`${metadata.level.toUpperCase()}`);
    parts.push('</h2>');

    // 시간
    parts.push('<p>');
    parts.push(`<strong>Timestamp:</strong> ${formatTimestamp(metadata.timestamp)}`);
    parts.push('</p>');

    // 모듈
    if (metadata.module)
    {
        parts.push('<p>');
        parts.push(`<strong>Module:</strong> ${metadata.module}`);
        parts.push('</p>');
    }

    // 메시지
    parts.push('<p>');
    parts.push(`<strong>Message:</strong> ${metadata.message}`);
    parts.push('</p>');

    // Context
    if (metadata.context)
    {
        parts.push('<h3>Context</h3>');
        parts.push('<pre style="background: #f4f4f4; padding: 10px; border-radius: 4px;">');
        parts.push(JSON.stringify(metadata.context, null, 2));
        parts.push('</pre>');
    }

    // 에러
    if (metadata.error)
    {
        parts.push('<h3>Error Stack Trace</h3>');
        parts.push('<pre style="background: #fff0f0; padding: 10px; border-radius: 4px;">');
        parts.push(formatError(metadata.error));
        parts.push('</pre>');
    }

    parts.push('</body>');
    parts.push('</html>');

    return parts.join('\n');
}

/**
 * Email 레벨별 컬러
 */
function getEmailColor(level: LogLevel): string
{
    const colors: Record<LogLevel, string> = {
        debug: '#00BCD4',
        info: '#4CAF50',
        warn: '#FF9800',
        error: '#F44336',
        fatal: '#9C27B0',
    };

    return colors[level];
}