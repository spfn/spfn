/**
 * File Transport
 *
 * 파일 출력 Transport
 *
 * ✅ 구현 완료:
 * - 날짜별 로그 파일 생성
 * - JSON 포맷 저장
 * - 로그 디렉토리 자동 생성
 *
 * ⚠️ 개선 필요:
 * - 파일 크기 기반 로테이션
 * - 오래된 파일 자동 삭제
 * - 비동기 쓰기 버퍼링
 *
 * 💡 향후 고려사항:
 * - 압축된 로그 아카이빙
 * - 외부 스토리지 전송 (S3 등)
 *
 * 🔗 관련 파일:
 * - src/logger/types.ts (Transport 인터페이스)
 * - src/logger/formatters.ts (포맷터)
 * - src/logger/config.ts (설정)
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Transport, LogMetadata, LogLevel, FileTransportConfig } from '../types';
import { LOG_LEVEL_PRIORITY } from '../types';
import { formatJSON } from '../formatters';

/**
 * File Transport
 */
export class FileTransport implements Transport
{
    public readonly name = 'file';
    public readonly level: LogLevel;
    public readonly enabled: boolean;

    private logDir: string;

    constructor(config: FileTransportConfig)
    {
        this.level = config.level;
        this.enabled = config.enabled;
        this.logDir = config.logDir;

        // TODO: 향후 파일 로테이션 구현 시 사용
        // this.maxFileSize = config.maxFileSize ?? 10 * 1024 * 1024; // 10MB
        // this.maxFiles = config.maxFiles ?? 10;

        // 로그 디렉토리가 없으면 생성
        if (!existsSync(this.logDir))
        {
            mkdirSync(this.logDir, { recursive: true });
        }
    }

    async log(metadata: LogMetadata): Promise<void>
    {
        // Enabled 상태 체크
        if (!this.enabled)
        {
            return;
        }

        // 로그 레벨 체크
        if (LOG_LEVEL_PRIORITY[metadata.level] < LOG_LEVEL_PRIORITY[this.level])
        {
            return;
        }

        // JSON 포맷으로 변환
        const message = formatJSON(metadata);

        // 파일명: YYYY-MM-DD.log
        const filename = this.getLogFilename(metadata.timestamp);
        const filepath = join(this.logDir, filename);

        // 파일에 추가 (각 줄마다 개행)
        try
        {
            appendFileSync(filepath, message + '\n', 'utf-8');
        }
        catch (error)
        {
            // 파일 쓰기 실패 시 콘솔에 에러 출력
            console.error('Failed to write log to file:', error);
        }
    }

    /**
     * 날짜별 로그 파일명 생성
     */
    private getLogFilename(date: Date): string
    {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}.log`;
    }

    async close(): Promise<void>
    {
        // 파일 닫기 (현재는 appendFileSync 사용으로 불필요)
        // 향후 비동기 스트림 사용 시 구현
    }
}