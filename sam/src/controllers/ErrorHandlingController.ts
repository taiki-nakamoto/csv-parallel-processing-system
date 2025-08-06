import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ErrorHandlingService, ErrorContext, ErrorHandlingResult, ErrorBatchHandlingResult } from '../application/services/ErrorHandlingService';
import { BaseError } from '../domain/errors/BaseError';
import { DIContainer } from '../infrastructure/di/DIContainer';

/**
 * エラーハンドリング機能のコントローラー（プレゼンテーション層）
 * エラー処理、分析、エスカレーションのエンドポイント
 * 設計書準拠: 02-01_基本設計書_Lambda開発標準仕様書.md
 */
export class ErrorHandlingController {
    constructor(
        private readonly errorHandlingService: ErrorHandlingService
    ) {}

    /**
     * 単一エラーハンドリング処理
     * @param event APIGatewayProxyEvent
     * @param context Lambda Context
     * @returns APIGatewayProxyResult
     */
    async handleSingleError(
        event: APIGatewayProxyEvent,
        context: Context
    ): Promise<APIGatewayProxyResult> {
        const startTime = Date.now();
        let errorContext: ErrorContext;
        
        try {
            // リクエストボディのパース
            const requestBody = JSON.parse(event.body || '{}');
            
            // バリデーション
            const validationResult = this.validateErrorHandlingRequest(requestBody);
            if (!validationResult.isValid) {
                return this.createErrorResponse(
                    400,
                    'VALIDATION_ERROR',
                    validationResult.errors.join(', ')
                );
            }

            // エラーコンテキストの構築
            errorContext = {
                executionId: requestBody.executionId || context.awsRequestId,
                eventType: requestBody.eventType || 'ERROR_HANDLING',
                functionName: context.functionName,
                userId: requestBody.userId,
                correlationId: requestBody.correlationId,
                retryCount: requestBody.retryCount || 0,
                metadata: requestBody.metadata
            };

            // エラーオブジェクトの再構築
            const error = this.reconstructError(requestBody.error);

            // エラーハンドリング実行
            const result = await this.errorHandlingService.handleError(error, errorContext);

            const processingTime = Date.now() - startTime;

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Processing-Time': processingTime.toString()
                },
                body: JSON.stringify({
                    success: true,
                    data: {
                        executionId: errorContext.executionId,
                        handled: result.handled,
                        classification: result.classification,
                        retryable: result.retryable,
                        escalated: result.escalated,
                        processingTimeMs: result.processingTimeMs,
                        errorResponse: result.errorResponse,
                        retryOptions: result.retryOptions
                    },
                    timestamp: new Date().toISOString()
                })
            };

        } catch (handlingError) {
            const processingTime = Date.now() - startTime;

            // エラーハンドリング中のエラー
            if (handlingError instanceof BaseError) {
                return {
                    statusCode: handlingError.statusCode,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        success: false,
                        error: handlingError.toApiResponse(),
                        timestamp: new Date().toISOString(),
                        processingTimeMs: processingTime
                    })
                };
            }

            // 予期しないエラー
            return this.createErrorResponse(
                500,
                'ERROR_HANDLING_FAILED',
                'Failed to handle error',
                processingTime
            );
        }
    }

    /**
     * バッチエラーハンドリング処理
     * @param event APIGatewayProxyEvent
     * @param context Lambda Context
     * @returns APIGatewayProxyResult
     */
    async handleErrorBatch(
        event: APIGatewayProxyEvent,
        context: Context
    ): Promise<APIGatewayProxyResult> {
        const startTime = Date.now();
        let errorContext: ErrorContext;
        
        try {
            // リクエストボディのパース
            const requestBody = JSON.parse(event.body || '{}');
            
            // バリデーション
            const validationResult = this.validateBatchErrorHandlingRequest(requestBody);
            if (!validationResult.isValid) {
                return this.createErrorResponse(
                    400,
                    'VALIDATION_ERROR',
                    validationResult.errors.join(', ')
                );
            }

            // エラーコンテキストの構築
            errorContext = {
                executionId: requestBody.executionId || context.awsRequestId,
                eventType: requestBody.eventType || 'BATCH_ERROR_HANDLING',
                functionName: context.functionName,
                userId: requestBody.userId,
                correlationId: requestBody.correlationId,
                metadata: requestBody.metadata
            };

            // エラー配列の再構築
            const errors: Error[] = requestBody.errors.map((errorData: any) => 
                this.reconstructError(errorData)
            );

            // バッチエラーハンドリング実行
            const result = await this.errorHandlingService.handleErrorBatch(errors, errorContext);

            const processingTime = Date.now() - startTime;

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Processing-Time': processingTime.toString()
                },
                body: JSON.stringify({
                    success: true,
                    data: {
                        executionId: errorContext.executionId,
                        summary: {
                            totalErrors: result.totalErrors,
                            handledCount: result.handledCount,
                            retryableCount: result.retryableCount,
                            nonRetryableCount: result.nonRetryableCount,
                            criticalCount: result.criticalCount,
                            warningCount: result.warningCount
                        },
                        errorsByType: result.errorsByType,
                        recommendations: result.recommendations,
                        processingTimeMs: processingTime
                    },
                    timestamp: new Date().toISOString()
                })
            };

        } catch (handlingError) {
            const processingTime = Date.now() - startTime;

            // エラーハンドリング中のエラー
            if (handlingError instanceof BaseError) {
                return {
                    statusCode: handlingError.statusCode,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        success: false,
                        error: handlingError.toApiResponse(),
                        timestamp: new Date().toISOString(),
                        processingTimeMs: processingTime
                    })
                };
            }

            // 予期しないエラー
            return this.createErrorResponse(
                500,
                'BATCH_ERROR_HANDLING_FAILED',
                'Failed to handle error batch',
                processingTime
            );
        }
    }

    /**
     * エラー統計取得
     * @param event APIGatewayProxyEvent
     * @param context Lambda Context
     * @returns APIGatewayProxyResult
     */
    async getErrorStatistics(
        event: APIGatewayProxyEvent,
        context: Context
    ): Promise<APIGatewayProxyResult> {
        const startTime = Date.now();
        
        try {
            const queryParams = event.queryStringParameters || {};
            const executionId = queryParams.executionId;
            const timeRange = queryParams.timeRange || '1h'; // 1h, 1d, 1w

            if (!executionId) {
                return this.createErrorResponse(
                    400,
                    'MISSING_PARAMETER',
                    'executionId is required'
                );
            }

            // TODO: エラー統計の実装（将来的な拡張）
            // 現在は基本的な統計情報を返す
            const statistics = {
                executionId,
                timeRange,
                errorCount: 0,
                retryableErrors: 0,
                nonRetryableErrors: 0,
                errorsByType: {},
                lastUpdated: new Date().toISOString()
            };

            const processingTime = Date.now() - startTime;

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Processing-Time': processingTime.toString()
                },
                body: JSON.stringify({
                    success: true,
                    data: statistics,
                    timestamp: new Date().toISOString()
                })
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;

            if (error instanceof BaseError) {
                return {
                    statusCode: error.statusCode,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        success: false,
                        error: error.toApiResponse(),
                        timestamp: new Date().toISOString(),
                        processingTimeMs: processingTime
                    })
                };
            }

            return this.createErrorResponse(
                500,
                'STATISTICS_RETRIEVAL_FAILED',
                'Failed to retrieve error statistics',
                processingTime
            );
        }
    }

    /**
     * 単一エラーハンドリングリクエストのバリデーション
     */
    private validateErrorHandlingRequest(requestBody: any): ValidationResult {
        const errors: string[] = [];

        if (!requestBody.error) {
            errors.push('error is required');
        }

        if (!requestBody.executionId) {
            errors.push('executionId is required');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * バッチエラーハンドリングリクエストのバリデーション
     */
    private validateBatchErrorHandlingRequest(requestBody: any): ValidationResult {
        const errors: string[] = [];

        if (!requestBody.errors || !Array.isArray(requestBody.errors)) {
            errors.push('errors array is required');
        } else if (requestBody.errors.length === 0) {
            errors.push('errors array cannot be empty');
        } else if (requestBody.errors.length > 25) {
            errors.push('errors array cannot contain more than 25 items');
        }

        if (!requestBody.executionId) {
            errors.push('executionId is required');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * エラーオブジェクトの再構築
     */
    private reconstructError(errorData: any): Error {
        if (typeof errorData === 'string') {
            return new Error(errorData);
        }

        if (typeof errorData === 'object' && errorData !== null) {
            const error = new Error(errorData.message || 'Unknown error');
            error.name = errorData.name || 'Error';
            error.stack = errorData.stack;

            // カスタムプロパティを追加
            if (errorData.code) {
                (error as any).code = errorData.code;
            }
            if (errorData.statusCode) {
                (error as any).statusCode = errorData.statusCode;
            }

            return error;
        }

        return new Error('Invalid error data');
    }

    /**
     * エラーレスポンス作成
     */
    private createErrorResponse(
        statusCode: number,
        errorCode: string,
        message: string,
        processingTimeMs?: number
    ): APIGatewayProxyResult {
        return {
            statusCode,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: {
                    code: errorCode,
                    message,
                    timestamp: new Date().toISOString()
                },
                processingTimeMs
            })
        };
    }

    /**
     * ファクトリーメソッド
     * DIコンテナからインスタンスを作成
     */
    static create(): ErrorHandlingController {
        const errorHandlingService = DIContainer.getInstance().get<ErrorHandlingService>('ErrorHandlingService');
        return new ErrorHandlingController(errorHandlingService);
    }
}

/**
 * バリデーション結果型定義
 */
interface ValidationResult {
    isValid: boolean;
    errors: string[];
}