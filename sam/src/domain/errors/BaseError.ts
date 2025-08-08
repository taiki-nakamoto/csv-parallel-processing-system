/**
 * ベースエラークラス（ドメイン層）
 * 全てのカスタムエラーの基底クラス
 * 設計書準拠: 02-01_基本設計書_Lambda開発標準仕様書.md
 */
export abstract class BaseError extends Error {
    abstract readonly code: string;
    abstract readonly statusCode: number;
    abstract readonly errorType: ErrorType;
    abstract readonly isRetryable: boolean;
    readonly timestamp: string;
    readonly correlationId?: string;
    readonly metadata?: Record<string, any>;

    constructor(
        message: string,
        correlationId?: string,
        metadata?: Record<string, any>
    ) {
        super(message);
        this.name = this.constructor.name;
        this.timestamp = new Date().toISOString();
        this.correlationId = correlationId;
        this.metadata = metadata;
        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * エラー情報をJSON形式で取得
     */
    toJSON(): Record<string, any> {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            statusCode: this.statusCode,
            errorType: this.errorType,
            isRetryable: this.isRetryable,
            timestamp: this.timestamp,
            correlationId: this.correlationId,
            metadata: this.metadata,
            stack: this.stack
        };
    }

    /**
     * ログ用の構造化エラー情報を取得
     */
    toLogEntry(): Record<string, any> {
        return {
            error_code: this.code,
            error_type: this.errorType,
            error_message: this.message,
            is_retryable: this.isRetryable,
            correlation_id: this.correlationId,
            metadata: this.metadata,
            timestamp: this.timestamp
        };
    }

    /**
     * APIレスポンス用のエラー情報を取得
     */
    toApiResponse(): Record<string, any> {
        return {
            error: this.code,
            message: this.message,
            timestamp: this.timestamp,
            correlationId: this.correlationId
        };
    }
}

/**
 * エラータイプ列挙型
 */
export enum ErrorType {
    BUSINESS = 'BUSINESS',           // ビジネスエラー（ユーザー起因）
    SYSTEM = 'SYSTEM',               // システムエラー（アプリケーション起因）
    INFRASTRUCTURE = 'INFRASTRUCTURE' // インフラエラー（AWS/外部サービス起因）
}

/**
 * ビジネスエラー基底クラス
 */
export abstract class BusinessError extends BaseError {
    readonly errorType = ErrorType.BUSINESS;
    readonly isRetryable = false; // ビジネスエラーは基本的にリトライ不可
    readonly statusCode = 400;    // デフォルトは400 Bad Request
}

/**
 * システムエラー基底クラス
 */
export abstract class SystemError extends BaseError {
    readonly errorType = ErrorType.SYSTEM;
    readonly isRetryable = true;  // システムエラーは基本的にリトライ可能
    readonly statusCode = 500;    // デフォルトは500 Internal Server Error
}

/**
 * インフラストラクチャエラー基底クラス
 */
export abstract class InfrastructureError extends BaseError {
    readonly errorType = ErrorType.INFRASTRUCTURE;
    readonly isRetryable = true;  // インフラエラーは基本的にリトライ可能
    readonly statusCode = 503;    // デフォルトは503 Service Unavailable
}