/**
 * File Transport
 *
 * File output transport with date and size-based rotation, automatic cleanup.
 */

import { createWriteStream, existsSync, mkdirSync, statSync, readdirSync, unlinkSync, renameSync } from 'fs';
import type { WriteStream } from 'fs';
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

    private readonly logDir: string;
    private readonly maxFileSize: number;
    private readonly maxFiles: number;
    private currentStream: WriteStream | null = null;
    private currentFilename: string | null = null;

    constructor(config: FileTransportConfig)
    {
        this.level = config.level;
        this.enabled = config.enabled;
        this.logDir = config.logDir;
        this.maxFileSize = config.maxFileSize ?? 10 * 1024 * 1024; // 10MB
        this.maxFiles = config.maxFiles ?? 10;

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

        // 날짜가 변경되면 스트림 교체
        if (this.currentFilename !== filename)
        {
            await this.rotateStream(filename);
            await this.cleanOldFiles(); // 오래된 파일 정리
        }
        // 파일 크기 체크 및 로테이션
        else if (this.currentFilename)
        {
            await this.checkAndRotateBySize();
        }

        // 스트림에 쓰기
        if (this.currentStream)
        {
            return new Promise((resolve, reject) =>
            {
                this.currentStream!.write(message + '\n', 'utf-8', (error: Error | null | undefined) =>
                {
                    if (error)
                    {
                        // 파일 쓰기 실패 시 stderr로 출력 (fallback)
                        process.stderr.write(`[FileTransport] Failed to write log: ${error.message}\n`);
                        reject(error);
                    }
                    else
                    {
                        resolve();
                    }
                });
            });
        }
    }

    /**
     * 스트림 교체 (날짜 변경 시)
     */
    private async rotateStream(filename: string): Promise<void>
    {
        // 기존 스트림 닫기
        if (this.currentStream)
        {
            await this.closeStream();
        }

        // 새 스트림 생성
        const filepath = join(this.logDir, filename);

        this.currentStream = createWriteStream(filepath, {
            flags: 'a', // append mode
            encoding: 'utf-8',
        });

        this.currentFilename = filename;

        // 스트림 에러 핸들링
        this.currentStream.on('error', (error) =>
        {
            process.stderr.write(`[FileTransport] Stream error: ${error.message}\n`);
            // 에러 발생 시 스트림 초기화
            this.currentStream = null;
            this.currentFilename = null;
        });
    }

    /**
     * 현재 스트림 닫기
     */
    private async closeStream(): Promise<void>
    {
        if (!this.currentStream)
        {
            return;
        }

        return new Promise((resolve, reject) =>
        {
            this.currentStream!.end((error: Error | null | undefined) =>
            {
                if (error)
                {
                    reject(error);
                }
                else
                {
                    this.currentStream = null;
                    this.currentFilename = null;
                    resolve();
                }
            });
        });
    }

    /**
     * 파일 크기 체크 및 크기 기반 로테이션
     */
    private async checkAndRotateBySize(): Promise<void>
    {
        if (!this.currentFilename)
        {
            return;
        }

        const filepath = join(this.logDir, this.currentFilename);

        // 파일이 존재하지 않으면 스킵
        if (!existsSync(filepath))
        {
            return;
        }

        try
        {
            const stats = statSync(filepath);

            // 파일 크기가 maxFileSize를 초과하면 로테이션
            if (stats.size >= this.maxFileSize)
            {
                await this.rotateBySize();
            }
        }
        catch (error)
        {
            // 파일 stat 실패 시 무시
            const errorMessage = error instanceof Error ? error.message : String(error);
            process.stderr.write(`[FileTransport] Failed to check file size: ${errorMessage}\n`);
        }
    }

    /**
     * 크기 기반 로테이션 수행
     * 예: 2025-01-01.log -> 2025-01-01.1.log, 2025-01-01.1.log -> 2025-01-01.2.log
     */
    private async rotateBySize(): Promise<void>
    {
        if (!this.currentFilename)
        {
            return;
        }

        // 기존 스트림 닫기
        await this.closeStream();

        const baseName = this.currentFilename.replace(/\.log$/, '');
        const files = readdirSync(this.logDir);

        // 현재 날짜의 로그 파일들 찾기 (예: 2025-01-01.log, 2025-01-01.1.log, ...)
        const relatedFiles = files
            .filter(file => file.startsWith(baseName) && file.endsWith('.log'))
            .sort()
            .reverse(); // 역순 정렬로 높은 번호부터 처리

        // 기존 파일들을 번호 증가시켜 이동 (예: .1.log -> .2.log)
        for (const file of relatedFiles)
        {
            const match = file.match(/\.(\d+)\.log$/);
            if (match)
            {
                const oldNum = parseInt(match[1], 10);
                const newNum = oldNum + 1;
                const oldPath = join(this.logDir, file);
                const newPath = join(this.logDir, `${baseName}.${newNum}.log`);

                try
                {
                    renameSync(oldPath, newPath);
                }
                catch (error)
                {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    process.stderr.write(`[FileTransport] Failed to rotate file: ${errorMessage}\n`);
                }
            }
        }

        // 현재 파일을 .1.log로 이동
        const currentPath = join(this.logDir, this.currentFilename);
        const newPath = join(this.logDir, `${baseName}.1.log`);

        try
        {
            if (existsSync(currentPath))
            {
                renameSync(currentPath, newPath);
            }
        }
        catch (error)
        {
            const errorMessage = error instanceof Error ? error.message : String(error);
            process.stderr.write(`[FileTransport] Failed to rotate current file: ${errorMessage}\n`);
        }

        // 새 스트림 생성 (동일한 파일명으로)
        await this.rotateStream(this.currentFilename);
    }

    /**
     * 오래된 로그 파일 정리
     * maxFiles 개수를 초과하는 로그 파일 삭제
     */
    private async cleanOldFiles(): Promise<void>
    {
        try
        {
            // 디렉토리가 존재하지 않으면 스킵
            if (!existsSync(this.logDir))
            {
                return;
            }

            const files = readdirSync(this.logDir);

            // .log로 끝나는 파일만 필터링 후 수정 시간 기준 정렬
            const logFiles = files
                .filter(file => file.endsWith('.log'))
                .map(file =>
                {
                    const filepath = join(this.logDir, file);
                    const stats = statSync(filepath);
                    return { file, mtime: stats.mtime };
                })
                .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // 최신 파일이 앞으로

            // maxFiles를 초과하는 오래된 파일들 삭제
            if (logFiles.length > this.maxFiles)
            {
                const filesToDelete = logFiles.slice(this.maxFiles);

                for (const { file } of filesToDelete)
                {
                    const filepath = join(this.logDir, file);
                    try
                    {
                        unlinkSync(filepath);
                    }
                    catch (error)
                    {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        process.stderr.write(`[FileTransport] Failed to delete old file "${file}": ${errorMessage}\n`);
                    }
                }
            }
        }
        catch (error)
        {
            const errorMessage = error instanceof Error ? error.message : String(error);
            process.stderr.write(`[FileTransport] Failed to clean old files: ${errorMessage}\n`);
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
        // 스트림 정리
        await this.closeStream();
    }
}