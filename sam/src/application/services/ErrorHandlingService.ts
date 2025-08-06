import { Logger } from '@aws-lambda-powertools/logger';
import { BaseError, ErrorType } from '../../domain/errors/BaseError';
import { RetryStrategy, RetryOptions } from '../../domain/services/RetryStrategy';
import { AuditLog } from '../../domain/models/AuditLog';
import { IAuditLogRepository } from '../../domain/interfaces/IAuditLogRepository';
import { IProcessingMetadataRepository } from '../../domain/interfaces/IProcessingMetadataRepository';
import { ProcessingMetadata } from '../../domain/models/ProcessingMetadata';

const logger = new Logger({ serviceName: 'ErrorHandlingService' });

/**
 * エラーハンドリングサービス（アプリケーション層）
 * エラーの分類、集約、エスカレーション処理
 * 設計書準拠: 02-01_基本設計書_Lambda開発標準仕様書.md
 */
export class ErrorHandlingService {
    private errorThresholds: ErrorThresholds;
    private errorAggregation: Map<string, ErrorAggregationData>;

    constructor(
        private readonly auditLogRepository: IAuditLogRepository,
        private readonly processingMetadataRepository: IProcessingMetadataRepository
    ) {
        this.errorThresholds = {
            criticalErrorRate: 0.1,    // 10%以上のエラー率でクリティカル
            warningErrorRate: 0.05,    // 5%以上のエラー率で警告
            maxConsecutiveErrors: 5,   // 連続5回エラーでアラート
            aggregationWindowMs: 60000  // 1分間の集約ウィンドウ
        };
        this.errorAggregation = new Map();
    }

    /**
     * エラーを処理し、適切な対応を実行
     * @param error エラーオブジェクト
     * @param context エラーコンテキスト
     * @returns エラー処理結果
     */
    async handleError(
        error: Error,
        context: ErrorContext
    ): Promise<ErrorHandlingResult> {
        const startTime = Date.now();

        try {
            logger.error('Handling error', {
                errorName: error.name,
                errorMessage: error.message,
                executionId: context.executionId,
                eventType: context.eventType
            });

            // 1. エラー分類
            const classification = this.classifyError(error);

            // 2. 監査ログ記録
            await this.recordErrorAuditLog(error, context, classification);

            // 3. エラー集約と閾値チェック
            const aggregationResult = await this.aggregateError(error, context, classification);

            // 4. リトライ判定
            const retryDecision = this.determineRetryStrategy(error, classification, context);

            // 5. エラーエスカレーション判定
            if (aggregationResult.shouldEscalate) {
                await this.escalateError(error, context, aggregationResult);
            }

            // 6. 処理メタデータ更新
            await this.updateProcessingMetadata(context.executionId, error, classification);

            const processingTime = Date.now() - startTime;

            const result: ErrorHandlingResult = {
                handled: true,
                classification,
                retryable: retryDecision.shouldRetry,
                retryOptions: retryDecision.options,
                escalated: aggregationResult.shouldEscalate,
                errorResponse: this.createErrorResponse(error, classification),
                processingTimeMs: processingTime
            };

            logger.info('Error handling completed', {
                executionId: context.executionId,
                errorType: classification.errorType,
                retryable: result.retryable,
                escalated: result.escalated,
                processingTimeMs
            });

            return result;

        } catch (handlingError) {
            logger.error('Failed to handle error', {
                originalError: error.message,
                handlingError: handlingError instanceof Error ? handlingError.message : String(handlingError),
                executionId: context.executionId
            });

            // エラーハンドリング自体が失敗した場合のフォールバック
            return {
                handled: false,
                classification: {
                    errorType: ErrorType.SYSTEM,
                    errorCode: 'ERROR_HANDLING_FAILED',
                    isRetryable: false,
                    severity: 'CRITICAL'
                },
                retryable: false,
                escalated: false,
                errorResponse: this.createFallbackErrorResponse(error),
                processingTimeMs: Date.now() - startTime
            };
        }
    }

    /**
     * 複数のエラーをバッチ処理
     * @param errors エラー配列
     * @param context エラーコンテキスト
     * @returns バッチ処理結果
     */
    async handleErrorBatch(
        errors: Error[],
        context: ErrorContext
    ): Promise<ErrorBatchHandlingResult> {
        const results: ErrorHandlingResult[] = [];
        const errorsByType: Record<string, number> = {};
        const retryableErrors: Error[] = [];
        const nonRetryableErrors: Error[] = [];

        for (const error of errors) {
            const result = await this.handleError(error, context);
            results.push(result);

            // エラータイプ別集計
            const errorType = result.classification.errorType;
            errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;

            // リトライ可能性別分類
            if (result.retryable) {
                retryableErrors.push(error);
            } else {
                nonRetryableErrors.push(error);
            }
        }

        // 集約統計の計算
        const totalErrors = errors.length;
        const criticalErrors = results.filter(r => r.classification.severity === 'CRITICAL').length;
        const warningErrors = results.filter(r => r.classification.severity === 'WARNING').length;

        const batchResult: ErrorBatchHandlingResult = {
            totalErrors,
            handledCount: results.filter(r => r.handled).length,
            retryableCount: retryableErrors.length,
            nonRetryableCount: nonRetryableErrors.length,
            errorsByType,
            criticalCount: criticalErrors,
            warningCount: warningErrors,
            results,
            recommendations: this.generateRecommendations(errorsByType, totalErrors)
        };

        logger.info('Error batch handling completed', {
            executionId: context.executionId,
            totalErrors,
            retryableCount: retryableErrors.length,
            criticalCount: criticalErrors
        });

        return batchResult;
    }

    /**
     * エラーを分類
     */
    private classifyError(error: Error): ErrorClassification {
        // BaseErrorの場合は既に分類情報を持っている
        if (error instanceof BaseError) {
            return {
                errorType: error.errorType,
                errorCode: error.code,
                isRetryable: error.isRetryable,
                severity: this.determineSeverity(error)
            };
        }

        // AWS SDKエラーの判定
        if ('statusCode' in error && typeof error.statusCode === 'number') {
            const statusCode = error.statusCode;
            
            if (statusCode >= 400 && statusCode < 500) {
                return {
                    errorType: ErrorType.BUSINESS,
                    errorCode: `HTTP_${statusCode}`,
                    isRetryable: statusCode === 429, // Too Many Requestsのみリトライ可能
                    severity: 'WARNING'
                };
            } else if (statusCode >= 500) {
                return {
                    errorType: ErrorType.INFRASTRUCTURE,
                    errorCode: `HTTP_${statusCode}`,
                    isRetryable: true,
                    severity: statusCode === 503 ? 'WARNING' : 'ERROR'
                };
            }
        }

        // デフォルト分類
        return {
            errorType: ErrorType.SYSTEM,
            errorCode: 'UNKNOWN_ERROR',
            isRetryable: false,
            severity: 'ERROR'
        };
    }

    /**
     * エラーの深刻度を判定
     */
    private determineSeverity(error: BaseError): ErrorSeverity {
        // データ整合性エラーは常にCRITICAL
        if (error.code === 'DATA_INTEGRITY_ERROR') {
            return 'CRITICAL';
        }

        // インフラエラーは基本的にWARNING
        if (error.errorType === ErrorType.INFRASTRUCTURE) {
            return 'WARNING';
        }

        // ビジネスエラーは基本的にINFO
        if (error.errorType === ErrorType.BUSINESS) {
            return 'INFO';
        }

        // システムエラーはERROR
        return 'ERROR';
    }

    /**
     * リトライ戦略を決定
     */
    private determineRetryStrategy(
        error: Error,
        classification: ErrorClassification,
        context: ErrorContext
    ): RetryDecision {
        // リトライ不可能なエラーの場合
        if (!classification.isRetryable) {
            return {
                shouldRetry: false,
                reason: 'Error is not retryable'
            };
        }

        // 既にリトライ上限に達している場合
        if (context.retryCount && context.retryCount >= 3) {
            return {
                shouldRetry: false,
                reason: 'Max retry attempts reached'
            };
        }

        // リトライオプションを設定
        const options: RetryOptions = {
            maxAttempts: 3,
            initialDelay: 1000,
            backoffFactor: 2,
            jitterFactor: 0.3
        };

        // インフラエラーの場合は長めの遅延
        if (classification.errorType === ErrorType.INFRASTRUCTURE) {
            options.initialDelay = 2000;
            options.maxDelay = 30000;
        }

        return {
            shouldRetry: true,
            options,
            reason: 'Error is retryable'
        };
    }

    /**
     * エラー監査ログを記録
     */
    private async recordErrorAuditLog(
        error: Error,
        context: ErrorContext,
        classification: ErrorClassification
    ): Promise<void> {
        try {
            const auditLog = new AuditLog({
                executionId: context.executionId,
                timestamp: new Date(),
                eventType: context.eventType || 'ERROR_HANDLING',
                logLevel: 'ERROR',
                functionName: context.functionName || 'csv-processor',
                message: error.message,
                metadata: {
                    errorName: error.name,
                    errorType: classification.errorType,
                    errorCode: classification.errorCode,
                    severity: classification.severity,
                    isRetryable: classification.isRetryable,
                    stack: error.stack,
                    context
                },
                retentionDays: 90
            });

            await this.auditLogRepository.saveAuditLog(auditLog);

        } catch (logError) {
            logger.warn('Failed to record error audit log', {
                originalError: error.message,
                logError: logError instanceof Error ? logError.message : String(logError)
            });
        }
    }

    /**
     * エラーを集約し、閾値をチェック
     */
    private async aggregateError(
        error: Error,
        context: ErrorContext,
        classification: ErrorClassification
    ): Promise<AggregationResult> {
        const key = `${context.executionId}-${classification.errorType}`;
        const now = Date.now();

        // 既存の集約データを取得または作成
        let aggregation = this.errorAggregation.get(key);
        if (!aggregation || (now - aggregation.windowStart) > this.errorThresholds.aggregationWindowMs) {
            aggregation = {
                errorCount: 0,
                consecutiveErrors: 0,
                windowStart: now,
                lastErrorTime: now,
                errorTypes: new Map()
            };
            this.errorAggregation.set(key, aggregation);
        }

        // 集約データを更新
        aggregation.errorCount++;
        aggregation.lastErrorTime = now;
        aggregation.errorTypes.set(
            classification.errorCode,
            (aggregation.errorTypes.get(classification.errorCode) || 0) + 1
        );

        // 連続エラーカウント
        const timeSinceLastError = now - aggregation.lastErrorTime;
        if (timeSinceLastError < 5000) { // 5秒以内なら連続とみなす
            aggregation.consecutiveErrors++;
        } else {
            aggregation.consecutiveErrors = 1;
        }

        // エスカレーション判定
        const shouldEscalate = 
            aggregation.consecutiveErrors >= this.errorThresholds.maxConsecutiveErrors ||
            classification.severity === 'CRITICAL';

        return {
            shouldEscalate,
            errorCount: aggregation.errorCount,
            consecutiveErrors: aggregation.consecutiveErrors,
            windowDurationMs: now - aggregation.windowStart
        };
    }

    /**
     * エラーをエスカレート
     */
    private async escalateError(
        error: Error,
        context: ErrorContext,
        aggregation: AggregationResult
    ): Promise<void> {
        logger.error('Escalating error', {
            executionId: context.executionId,
            errorMessage: error.message,
            consecutiveErrors: aggregation.consecutiveErrors,
            totalErrors: aggregation.errorCount
        });

        // エスカレーション用の監査ログを記録
        const escalationLog = new AuditLog({
            executionId: context.executionId,
            timestamp: new Date(),
            eventType: 'ERROR_ESCALATION',
            logLevel: 'ERROR',
            functionName: context.functionName || 'csv-processor',
            message: `Error escalated: ${error.message}`,
            metadata: {
                errorName: error.name,
                consecutiveErrors: aggregation.consecutiveErrors,
                totalErrors: aggregation.errorCount,
                windowDurationMs: aggregation.windowDurationMs,
                context
            },
            retentionDays: 90
        });

        await this.auditLogRepository.saveAuditLog(escalationLog);

        // TODO: SNS通知、CloudWatch Alarmトリガー等の実装
    }

    /**
     * 処理メタデータを更新
     */
    private async updateProcessingMetadata(
        executionId: string,
        error: Error,
        classification: ErrorClassification
    ): Promise<void> {
        try {
            const existingMetadata = await this.processingMetadataRepository.getByExecutionId(executionId);
            
            if (existingMetadata) {
                const updatedMetadata = existingMetadata.fail({
                    errorMessage: error.message,
                    errorType: classification.errorCode,
                    errorStack: error.stack
                });

                await this.processingMetadataRepository.save(updatedMetadata);
            }

        } catch (updateError) {
            logger.warn('Failed to update processing metadata', {
                executionId,
                error: updateError instanceof Error ? updateError.message : String(updateError)
            });
        }
    }

    /**
     * エラーレスポンスを作成
     */
    private createErrorResponse(error: Error, classification: ErrorClassification): ErrorResponse {
        if (error instanceof BaseError) {
            return {
                statusCode: error.statusCode,
                error: error.code,
                message: error.message,
                timestamp: error.timestamp,
                correlationId: error.correlationId
            };
        }

        return {
            statusCode: 500,
            error: classification.errorCode,
            message: error.message,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * フォールバックエラーレスポンスを作成
     */
    private createFallbackErrorResponse(error: Error): ErrorResponse {
        return {
            statusCode: 500,
            error: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 推奨事項を生成
     */
    private generateRecommendations(
        errorsByType: Record<string, number>,
        totalErrors: number
    ): string[] {
        const recommendations: string[] = [];

        // インフラエラーが多い場合
        if (errorsByType[ErrorType.INFRASTRUCTURE] > totalErrors * 0.5) {
            recommendations.push('High infrastructure error rate detected. Check AWS service health and network connectivity.');
        }

        // ビジネスエラーが多い場合
        if (errorsByType[ErrorType.BUSINESS] > totalErrors * 0.7) {
            recommendations.push('High business error rate detected. Review input data validation and business rules.');
        }

        // システムエラーが多い場合
        if (errorsByType[ErrorType.SYSTEM] > totalErrors * 0.3) {
            recommendations.push('High system error rate detected. Check application logs and configuration.');
        }

        return recommendations;
    }
}

/**
 * エラーコンテキスト型定義
 */
export interface ErrorContext {
    executionId: string;
    eventType?: string;
    functionName?: string;
    userId?: string;
    correlationId?: string;
    retryCount?: number;
    metadata?: Record<string, any>;
}

/**
 * エラー分類型定義
 */
export interface ErrorClassification {
    errorType: ErrorType;
    errorCode: string;
    isRetryable: boolean;
    severity: ErrorSeverity;
}

/**
 * エラー深刻度型定義
 */
export type ErrorSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

/**
 * エラーハンドリング結果型定義
 */
export interface ErrorHandlingResult {
    handled: boolean;
    classification: ErrorClassification;
    retryable: boolean;
    retryOptions?: RetryOptions;
    escalated: boolean;
    errorResponse: ErrorResponse;
    processingTimeMs: number;
}

/**
 * エラーバッチハンドリング結果型定義
 */
export interface ErrorBatchHandlingResult {
    totalErrors: number;
    handledCount: number;
    retryableCount: number;
    nonRetryableCount: number;
    errorsByType: Record<string, number>;
    criticalCount: number;
    warningCount: number;
    results: ErrorHandlingResult[];
    recommendations: string[];
}

/**
 * エラーレスポンス型定義
 */
export interface ErrorResponse {
    statusCode: number;
    error: string;
    message: string;
    timestamp: string;
    correlationId?: string;
}

/**
 * リトライ判定結果型定義
 */
interface RetryDecision {
    shouldRetry: boolean;
    options?: RetryOptions;
    reason: string;
}

/**
 * エラー閾値設定型定義
 */
interface ErrorThresholds {
    criticalErrorRate: number;
    warningErrorRate: number;
    maxConsecutiveErrors: number;
    aggregationWindowMs: number;
}

/**
 * エラー集約データ型定義
 */
interface ErrorAggregationData {
    errorCount: number;
    consecutiveErrors: number;
    windowStart: number;
    lastErrorTime: number;
    errorTypes: Map<string, number>;
}

/**
 * 集約結果型定義
 */
interface AggregationResult {
    shouldEscalate: boolean;
    errorCount: number;
    consecutiveErrors: number;
    windowDurationMs: number;
}