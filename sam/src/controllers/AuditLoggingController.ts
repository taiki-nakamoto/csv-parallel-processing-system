import { Logger } from '@aws-lambda-powertools/logger';
import { AuditLoggingService } from '../application/services/AuditLoggingService';
import { AuditLog } from '../domain/models/AuditLog';

const logger = new Logger({ serviceName: 'AuditLoggingController' });

/**
 * 監査ログコントローラー（プレゼンテーション層）
 * 監査ログの受信、構造化、保存処理を制御
 * 設計書準拠: 03-12_詳細設計書_監視・ログ詳細設計.md
 */
export class AuditLoggingController {
    constructor(
        private readonly auditLoggingService: AuditLoggingService
    ) {}

    /**
     * 監査ログ記録処理（統合Lambda内部呼び出し用）
     * @param auditEvent 監査イベントデータ
     * @returns 処理結果
     */
    async recordAuditLog(auditEvent: {
        executionId: string;
        eventType: string;
        logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
        functionName: string;
        message: string;
        metadata?: Record<string, any>;
        correlationId?: string;
        userId?: string;
    }): Promise<{
        success: boolean;
        logId?: string;
        error?: string;
    }> {
        const startTime = Date.now();

        try {
            logger.info('Recording audit log', {
                executionId: auditEvent.executionId,
                eventType: auditEvent.eventType,
                logLevel: auditEvent.logLevel,
                correlationId: auditEvent.correlationId
            });

            // 監査ログドメインモデル作成
            const auditLog = new AuditLog({
                executionId: auditEvent.executionId,
                timestamp: new Date(),
                eventType: auditEvent.eventType,
                logLevel: auditEvent.logLevel,
                functionName: auditEvent.functionName,
                message: auditEvent.message,
                metadata: {
                    ...auditEvent.metadata,
                    correlationId: auditEvent.correlationId,
                    userId: auditEvent.userId,
                    source: 'audit-logging-controller'
                },
                retentionDays: 90 // 監査ログは90日間保持
            });

            // サービス層に処理を委託
            const result = await this.auditLoggingService.recordAuditLog(auditLog);

            const processingTime = Date.now() - startTime;

            logger.info('Audit log recorded successfully', {
                executionId: auditEvent.executionId,
                eventType: auditEvent.eventType,
                processingTimeMs: processingTime,
                logId: result.logId
            });

            return {
                success: true,
                logId: result.logId
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            
            logger.error('Failed to record audit log', {
                executionId: auditEvent.executionId,
                eventType: auditEvent.eventType,
                error: error instanceof Error ? error.message : String(error),
                processingTimeMs: processingTime
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * バッチ監査ログ記録処理（25件単位処理）
     * @param auditEvents 監査イベント配列
     * @returns バッチ処理結果
     */
    async recordAuditLogsBatch(auditEvents: Array<{
        executionId: string;
        eventType: string;
        logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
        functionName: string;
        message: string;
        metadata?: Record<string, any>;
        correlationId?: string;
        userId?: string;
    }>): Promise<{
        success: boolean;
        totalProcessed: number;
        successCount: number;
        errorCount: number;
        errors?: string[];
    }> {
        const startTime = Date.now();
        const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        try {
            logger.info('Processing audit logs batch', {
                batchId,
                batchSize: auditEvents.length,
                maxBatchSize: 25
            });

            // 25件単位に分割（設計書準拠）
            if (auditEvents.length > 25) {
                throw new Error('Batch size exceeds maximum of 25 records');
            }

            // 監査ログドメインモデル配列作成
            const auditLogs = auditEvents.map(event => new AuditLog({
                executionId: event.executionId,
                timestamp: new Date(),
                eventType: event.eventType,
                logLevel: event.logLevel,
                functionName: event.functionName,
                message: event.message,
                metadata: {
                    ...event.metadata,
                    correlationId: event.correlationId,
                    userId: event.userId,
                    batchId,
                    source: 'audit-logging-controller-batch'
                },
                retentionDays: 90
            }));

            // バッチ処理実行
            const result = await this.auditLoggingService.recordAuditLogsBatch(auditLogs);

            const processingTime = Date.now() - startTime;

            logger.info('Audit logs batch processed successfully', {
                batchId,
                totalProcessed: result.totalProcessed,
                successCount: result.successCount,
                errorCount: result.errorCount,
                processingTimeMs: processingTime
            });

            return {
                success: result.errorCount === 0,
                totalProcessed: result.totalProcessed,
                successCount: result.successCount,
                errorCount: result.errorCount,
                errors: result.errors
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            
            logger.error('Failed to process audit logs batch', {
                batchId,
                batchSize: auditEvents.length,
                error: error instanceof Error ? error.message : String(error),
                processingTimeMs: processingTime
            });

            return {
                success: false,
                totalProcessed: auditEvents.length,
                successCount: 0,
                errorCount: auditEvents.length,
                errors: [error instanceof Error ? error.message : String(error)]
            };
        }
    }

    /**
     * コリレーションIDによる監査ログ取得
     * @param correlationId コリレーションID
     * @param limit 取得件数制限
     * @returns 監査ログ配列
     */
    async getAuditLogsByCorrelationId(
        correlationId: string,
        limit: number = 100
    ): Promise<{
        success: boolean;
        auditLogs?: Array<{
            executionId: string;
            timestamp: string;
            eventType: string;
            logLevel: string;
            message: string;
        }>;
        error?: string;
    }> {
        try {
            logger.info('Retrieving audit logs by correlation ID', {
                correlationId,
                limit
            });

            const auditLogs = await this.auditLoggingService.getAuditLogsByCorrelationId(correlationId, limit);

            logger.info('Audit logs retrieved successfully', {
                correlationId,
                logCount: auditLogs.length
            });

            return {
                success: true,
                auditLogs: auditLogs.map(log => log.getSummary())
            };

        } catch (error) {
            logger.error('Failed to retrieve audit logs by correlation ID', {
                correlationId,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 実行IDによる監査ログ取得
     * @param executionId 実行ID
     * @param limit 取得件数制限
     * @returns 監査ログ配列
     */
    async getAuditLogsByExecutionId(
        executionId: string,
        limit: number = 100
    ): Promise<{
        success: boolean;
        auditLogs?: Array<{
            executionId: string;
            timestamp: string;
            eventType: string;
            logLevel: string;
            message: string;
        }>;
        error?: string;
    }> {
        try {
            logger.info('Retrieving audit logs by execution ID', {
                executionId,
                limit
            });

            const auditLogs = await this.auditLoggingService.getAuditLogsByExecutionId(executionId, limit);

            logger.info('Audit logs retrieved successfully', {
                executionId,
                logCount: auditLogs.length
            });

            return {
                success: true,
                auditLogs: auditLogs.map(log => log.getSummary())
            };

        } catch (error) {
            logger.error('Failed to retrieve audit logs by execution ID', {
                executionId,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 構造化ログメッセージ生成（CloudWatch Logs形式）
     * @param logData ログデータ
     * @returns 構造化ログメッセージ
     */
    createStructuredLogMessage(logData: {
        timestamp: Date;
        level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
        executionId: string;
        eventType: string;
        functionName: string;
        message: string;
        metadata?: Record<string, any>;
        correlationId?: string;
        userId?: string;
        traceId?: string;
    }): string {
        const structuredLog = {
            timestamp: logData.timestamp.toISOString(),
            level: logData.level,
            service: 'csv-processor',
            function_name: logData.functionName,
            request_id: logData.executionId,
            execution_id: logData.executionId,
            event_type: logData.eventType,
            message: logData.message,
            details: logData.metadata || {},
            correlation_id: logData.correlationId,
            user_id: logData.userId,
            trace_id: logData.traceId || process.env._X_AMZN_TRACE_ID
        };

        return JSON.stringify(structuredLog);
    }

    /**
     * ヘルスチェック（監査ログ機能の動作確認）
     * @returns ヘルスチェック結果
     */
    async healthCheck(): Promise<{
        status: 'healthy' | 'unhealthy';
        details: Record<string, any>;
        timestamp: string;
    }> {
        const testExecutionId = `health-check-${Date.now()}`;

        try {
            // テスト用監査ログ作成・保存
            const testResult = await this.recordAuditLog({
                executionId: testExecutionId,
                eventType: 'HEALTH_CHECK',
                logLevel: 'INFO',
                functionName: 'audit-logging-controller',
                message: 'Health check test log',
                metadata: {
                    test: true,
                    timestamp: new Date().toISOString()
                }
            });

            const details = {
                auditLoggingService: testResult.success,
                testLogRecorded: testResult.success,
                testExecutionId,
                lastChecked: new Date().toISOString()
            };

            return {
                status: testResult.success ? 'healthy' : 'unhealthy',
                details,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    error: error instanceof Error ? error.message : String(error),
                    testExecutionId,
                    lastChecked: new Date().toISOString()
                },
                timestamp: new Date().toISOString()
            };
        }
    }
}