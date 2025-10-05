/**
 * Custom Error Classes
 *
 * 타입 안전한 에러 처리를 위한 커스텀 에러 클래스 계층 구조
 * HTTP 상태 코드와 매핑되어 API 응답에 사용
 */

/**
 * 기본 Database Error
 *
 * 모든 데이터베이스 관련 에러의 베이스 클래스
 */
export class DatabaseError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500
    ) {
        super(message);
        this.name = 'DatabaseError';
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Connection Error (503 Service Unavailable)
 *
 * 데이터베이스 연결 실패, Connection Pool 고갈 등
 */
export class ConnectionError extends DatabaseError {
    constructor(message: string) {
        super(message, 503);
        this.name = 'ConnectionError';
    }
}

/**
 * Query Error (500 Internal Server Error)
 *
 * SQL 쿼리 실행 실패, 문법 오류 등
 */
export class QueryError extends DatabaseError {
    constructor(message: string, statusCode: number = 500) {
        super(message, statusCode);
        this.name = 'QueryError';
    }
}

/**
 * Not Found Error (404 Not Found)
 *
 * 요청한 리소스가 존재하지 않음
 */
export class NotFoundError extends QueryError {
    constructor(resource: string, id: string | number) {
        super(`${resource} with id ${id} not found`, 404);
        this.name = 'NotFoundError';
    }
}

/**
 * Validation Error (400 Bad Request)
 *
 * 입력 데이터 유효성 검증 실패
 */
export class ValidationError extends QueryError {
    constructor(message: string) {
        super(message, 400);
        this.name = 'ValidationError';
    }
}

/**
 * Transaction Error (500 Internal Server Error)
 *
 * 트랜잭션 시작/커밋/롤백 실패
 */
export class TransactionError extends DatabaseError {
    constructor(message: string, statusCode: number = 500) {
        super(message, statusCode);
        this.name = 'TransactionError';
    }
}

/**
 * Deadlock Error (409 Conflict)
 *
 * 데이터베이스 데드락 발생
 */
export class DeadlockError extends TransactionError {
    constructor(message: string) {
        super(message, 409);
        this.name = 'DeadlockError';
    }
}

/**
 * Duplicate Entry Error (409 Conflict)
 *
 * 유니크 제약 조건 위반 (예: 중복 이메일)
 */
export class DuplicateEntryError extends QueryError {
    constructor(field: string, value: string | number) {
        super(`${field} '${value}' already exists`, 409);
        this.name = 'DuplicateEntryError';
    }
}

/**
 * 에러가 DatabaseError 계열인지 확인
 */
export function isDatabaseError(error: unknown): error is DatabaseError {
    return error instanceof DatabaseError;
}

/**
 * PostgreSQL 에러 코드를 커스텀 에러로 변환
 *
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export function fromPostgresError(error: any): DatabaseError {
    const code = error?.code;
    const message = error?.message || 'Database error occurred';

    switch (code) {
        // Connection errors
        case '08000': // connection_exception
        case '08003': // connection_does_not_exist
        case '08006': // connection_failure
            return new ConnectionError(message);

        // Unique violation
        case '23505':
            const match = message.match(/Key \((\w+)\)=\(([^)]+)\)/);
            if (match) {
                return new DuplicateEntryError(match[1], match[2]);
            }
            return new DuplicateEntryError('field', 'value');

        // Deadlock
        case '40P01':
            return new DeadlockError(message);

        // Foreign key violation
        case '23503':
            return new ValidationError(message);

        // Default
        default:
            return new QueryError(message);
    }
}