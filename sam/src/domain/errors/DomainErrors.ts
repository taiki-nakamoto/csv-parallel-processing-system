import { BusinessError, SystemError, InfrastructureError } from './BaseError';

/**
 * ドメイン固有エラークラス定義
 * 設計書準拠: 02-01_基本設計書_Lambda開発標準仕様書.md
 */

// ================================================================================
// ビジネスエラー（400系）
// ================================================================================

/**
 * バリデーションエラー
 */
export class ValidationError extends BusinessError {
    readonly code = 'VALIDATION_ERROR';
    readonly statusCode = 400;

    constructor(
        message: string,
        public readonly validationErrors?: Array<{ field: string; message: string }>,
        correlationId?: string
    ) {
        super(message, correlationId, { validationErrors });
    }
}

/**
 * ユーザー未検出エラー
 */
export class UserNotFoundError extends BusinessError {
    readonly code = 'USER_NOT_FOUND';
    readonly statusCode = 404;

    constructor(
        public readonly userId: string,
        correlationId?: string
    ) {
        super(`User not found: ${userId}`, correlationId, { userId });
    }
}

/**
 * 重複エラー
 */
export class DuplicateError extends BusinessError {
    readonly code = 'DUPLICATE_ERROR';
    readonly statusCode = 409;

    constructor(
        message: string,
        public readonly duplicateKey: string,
        correlationId?: string
    ) {
        super(message, correlationId, { duplicateKey });
    }
}

/**
 * CSV形式エラー
 */
export class CsvFormatError extends BusinessError {
    readonly code = 'CSV_FORMAT_ERROR';
    readonly statusCode = 400;

    constructor(
        message: string,
        public readonly lineNumber?: number,
        public readonly columnName?: string,
        correlationId?: string
    ) {
        super(message, correlationId, { lineNumber, columnName });
    }
}

/**
 * ビジネスルール違反エラー
 */
export class BusinessRuleViolationError extends BusinessError {
    readonly code = 'BUSINESS_RULE_VIOLATION';
    readonly statusCode = 422;

    constructor(
        message: string,
        public readonly rule: string,
        public readonly value?: any,
        correlationId?: string
    ) {
        super(message, correlationId, { rule, value });
    }
}

/**
 * 閾値超過エラー
 */
export class ThresholdExceededError extends BusinessError {
    readonly code = 'THRESHOLD_EXCEEDED';
    readonly statusCode = 400;

    constructor(
        message: string,
        public readonly threshold: number,
        public readonly actual: number,
        correlationId?: string
    ) {
        super(message, correlationId, { threshold, actual });
    }
}

// ================================================================================
// システムエラー（500系）
// ================================================================================

/**
 * 処理タイムアウトエラー
 */
export class ProcessingTimeoutError extends SystemError {
    readonly code = 'PROCESSING_TIMEOUT';
    readonly statusCode = 504;
    readonly isRetryable = true;

    constructor(
        message: string,
        public readonly timeoutSeconds: number,
        correlationId?: string
    ) {
        super(message, correlationId, { timeoutSeconds });
    }
}

/**
 * データ整合性エラー
 */
export class DataIntegrityError extends SystemError {
    readonly code = 'DATA_INTEGRITY_ERROR';
    readonly statusCode = 500;
    readonly isRetryable = false; // データ整合性エラーはリトライ不可

    constructor(
        message: string,
        public readonly expectedValue?: any,
        public readonly actualValue?: any,
        correlationId?: string
    ) {
        super(message, correlationId, { expectedValue, actualValue });
    }
}

/**
 * 設定エラー
 */
export class ConfigurationError extends SystemError {
    readonly code = 'CONFIGURATION_ERROR';
    readonly statusCode = 500;
    readonly isRetryable = false; // 設定エラーはリトライ不可

    constructor(
        message: string,
        public readonly missingConfig?: string,
        correlationId?: string
    ) {
        super(message, correlationId, { missingConfig });
    }
}

/**
 * 同時実行制限エラー
 */
export class ConcurrencyLimitError extends SystemError {
    readonly code = 'CONCURRENCY_LIMIT_ERROR';
    readonly statusCode = 429;
    readonly isRetryable = true;

    constructor(
        message: string,
        public readonly limit: number,
        public readonly current: number,
        correlationId?: string
    ) {
        super(message, correlationId, { limit, current });
    }
}

// ================================================================================
// インフラストラクチャエラー（503系）
// ================================================================================

/**
 * データベース接続エラー
 */
export class DatabaseConnectionError extends InfrastructureError {
    readonly code = 'DATABASE_CONNECTION_ERROR';
    readonly statusCode = 503;

    constructor(
        message: string,
        public readonly originalError?: Error,
        correlationId?: string
    ) {
        super(message, correlationId, { 
            originalError: originalError?.message,
            originalStack: originalError?.stack 
        });
    }
}

/**
 * S3アクセスエラー
 */
export class S3AccessError extends InfrastructureError {
    readonly code = 'S3_ACCESS_ERROR';
    readonly statusCode = 503;

    constructor(
        message: string,
        public readonly bucket?: string,
        public readonly key?: string,
        public readonly originalError?: Error,
        correlationId?: string
    ) {
        super(message, correlationId, { 
            bucket, 
            key,
            originalError: originalError?.message 
        });
    }
}

/**
 * DynamoDBアクセスエラー
 */
export class DynamoDbAccessError extends InfrastructureError {
    readonly code = 'DYNAMODB_ACCESS_ERROR';
    readonly statusCode = 503;

    constructor(
        message: string,
        public readonly tableName?: string,
        public readonly operation?: string,
        public readonly originalError?: Error,
        correlationId?: string
    ) {
        super(message, correlationId, { 
            tableName,
            operation,
            originalError: originalError?.message 
        });
    }
}

/**
 * 外部APIエラー
 */
export class ExternalApiError extends InfrastructureError {
    readonly code = 'EXTERNAL_API_ERROR';
    readonly statusCode = 502;

    constructor(
        message: string,
        public readonly apiName: string,
        public readonly httpStatus?: number,
        public readonly originalError?: Error,
        correlationId?: string
    ) {
        super(message, correlationId, { 
            apiName,
            httpStatus,
            originalError: originalError?.message 
        });
    }
}

/**
 * AWSサービスエラー
 */
export class AwsServiceError extends InfrastructureError {
    readonly code = 'AWS_SERVICE_ERROR';
    readonly statusCode = 503;

    constructor(
        message: string,
        public readonly serviceName: string,
        public readonly awsErrorCode?: string,
        public readonly originalError?: Error,
        correlationId?: string
    ) {
        super(message, correlationId, { 
            serviceName,
            awsErrorCode,
            originalError: originalError?.message 
        });
    }
}