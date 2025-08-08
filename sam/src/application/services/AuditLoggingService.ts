import { Logger } from '@aws-lambda-powertools/logger';
import { AuditLog } from '../../domain/models/AuditLog';
import { IAuditLogRepository } from '../../domain/interfaces/IAuditLogRepository';
import { IProcessingMetadataRepository } from '../../domain/interfaces/IProcessingMetadataRepository';
import { ProcessingMetadata } from '../../domain/models/ProcessingMetadata';

const logger = new Logger({ serviceName: 'AuditLoggingService' });

/**
 * 監査ログサービス（アプリケーション層）
 * 監査ログの記録、検索、管理を担当
 * 設計書準拠: 03-12_詳細設計書_監視・ログ詳細設計.md
 */
export class AuditLoggingService {
    constructor(
        private readonly auditLogRepository: IAuditLogRepository,
        private readonly processingMetadataRepository: IProcessingMetadataRepository
    ) {}

    /**
     * 監査ログ記録
     * CloudWatch LogsとDynamoDBに同時記録
     * @param auditLog 監査ログオブジェクト
     * @returns 記録結果
     */
    async recordAuditLog(auditLog: AuditLog): Promise<{
        success: boolean;
        logId: string;
        cloudWatchRecorded: boolean;
        dynamoDbRecorded: boolean;
        error?: string;
    }> {
        const logId = `${auditLog.executionId}-${Date.now()}`;
        let cloudWatchRecorded = false;
        let dynamoDbRecorded = false;

        try {
            logger.debug('Recording audit log', {
                executionId: auditLog.executionId,
                eventType: auditLog.eventType,
                logLevel: auditLog.logLevel,
                logId
            });

            // 1. CloudWatch Logsに構造化ログとして記録
            try {
                const structuredMessage = auditLog.toCloudWatchMessage();
                
                // AWS Lambda Powertoolsのロガーを使用してCloudWatch Logsに記録
                switch (auditLog.logLevel) {
                    case 'DEBUG':
                        logger.debug(auditLog.message, {
                            auditLog: JSON.parse(structuredMessage),
                            logId
                        });
                        break;
                    case 'INFO':
                        logger.info(auditLog.message, {
                            auditLog: JSON.parse(structuredMessage),
                            logId
                        });
                        break;
                    case 'WARN':
                        logger.warn(auditLog.message, {
                            auditLog: JSON.parse(structuredMessage),
                            logId
                        });
                        break;
                    case 'ERROR':
                        logger.error(auditLog.message, {
                            auditLog: JSON.parse(structuredMessage),
                            logId
                        });
                        break;
                }
                
                cloudWatchRecorded = true;

            } catch (cwError) {
                logger.warn('Failed to record audit log to CloudWatch Logs', {
                    logId,
                    error: cwError instanceof Error ? cwError.message : String(cwError)
                });
            }

            // 2. DynamoDB（監査ログリポジトリ）に記録
            try {
                await this.auditLogRepository.saveAuditLog(auditLog);
                dynamoDbRecorded = true;

            } catch (dbError) {
                logger.warn('Failed to record audit log to DynamoDB', {
                    logId,
                    error: dbError instanceof Error ? dbError.message : String(dbError)
                });
            }

            // 3. 処理メタデータの更新（ログ統計）
            if (dynamoDbRecorded) {
                try {
                    await this.updateProcessingMetadataLogStats(
                        auditLog.executionId,
                        auditLog.logLevel,
                        auditLog.eventType
                    );
                } catch (metaError) {
                    // メタデータ更新の失敗は警告レベル
                    logger.warn('Failed to update processing metadata log stats', {
                        logId,
                        executionId: auditLog.executionId,
                        error: metaError instanceof Error ? metaError.message : String(metaError)
                    });
                }
            }

            const success = cloudWatchRecorded || dynamoDbRecorded;

            logger.debug('Audit log recording completed', {
                logId,
                success,
                cloudWatchRecorded,
                dynamoDbRecorded
            });

            return {
                success,
                logId,
                cloudWatchRecorded,
                dynamoDbRecorded
            };

        } catch (error) {
            logger.error('Failed to record audit log', {
                logId,
                executionId: auditLog.executionId,
                eventType: auditLog.eventType,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                logId,
                cloudWatchRecorded,
                dynamoDbRecorded,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * バッチ監査ログ記録（25件単位）
     * @param auditLogs 監査ログ配列
     * @returns バッチ記録結果
     */
    async recordAuditLogsBatch(auditLogs: AuditLog[]): Promise<{
        success: boolean;
        totalProcessed: number;
        successCount: number;
        errorCount: number;
        errors?: string[];
    }> {
        const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        try {
            logger.info('Processing audit logs batch', {
                batchId,
                batchSize: auditLogs.length
            });

            // 25件制限チェック（設計書準拠）
            if (auditLogs.length > 25) {
                throw new Error('Batch size exceeds maximum of 25 records');
            }

            // 各監査ログを順次処理
            for (const auditLog of auditLogs) {
                try {
                    const result = await this.recordAuditLog(auditLog);
                    if (result.success) {
                        successCount++;
                    } else {
                        errorCount++;
                        if (result.error) {
                            errors.push(`${auditLog.executionId}: ${result.error}`);
                        }
                    }
                } catch (error) {
                    errorCount++;
                    errors.push(`${auditLog.executionId}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            // バッチ統計のメタデータ記録
            if (auditLogs.length > 0) {
                try {
                    await this.recordBatchMetadata(batchId, auditLogs[0].executionId, {
                        totalProcessed: auditLogs.length,
                        successCount,
                        errorCount,
                        batchType: 'AUDIT_LOG_BATCH'
                    });
                } catch (metaError) {
                    logger.warn('Failed to record batch metadata', {
                        batchId,
                        error: metaError instanceof Error ? metaError.message : String(metaError)
                    });
                }
            }

            logger.info('Audit logs batch processing completed', {
                batchId,
                totalProcessed: auditLogs.length,
                successCount,
                errorCount,
                successRate: Math.round((successCount / auditLogs.length) * 100)
            });

            return {
                success: errorCount === 0,
                totalProcessed: auditLogs.length,
                successCount,
                errorCount,
                errors: errors.length > 0 ? errors : undefined
            };

        } catch (error) {
            logger.error('Failed to process audit logs batch', {
                batchId,
                batchSize: auditLogs.length,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                totalProcessed: auditLogs.length,
                successCount,
                errorCount: auditLogs.length,
                errors: [error instanceof Error ? error.message : String(error)]
            };
        }
    }

    /**
     * コリレーションIDによる監査ログ検索
     * @param correlationId コリレーションID
     * @param limit 取得件数制限
     * @returns 監査ログ配列
     */
    async getAuditLogsByCorrelationId(correlationId: string, limit: number = 100): Promise<AuditLog[]> {
        try {
            logger.debug('Searching audit logs by correlation ID', {
                correlationId,
                limit
            });

            const auditLogs = await this.auditLogRepository.getAuditLogsByCorrelationId(correlationId, limit);

            logger.debug('Audit logs retrieved by correlation ID', {
                correlationId,
                logCount: auditLogs.length
            });

            return auditLogs;

        } catch (error) {
            logger.error('Failed to retrieve audit logs by correlation ID', {
                correlationId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * 実行IDによる監査ログ検索
     * @param executionId 実行ID
     * @param limit 取得件数制限
     * @returns 監査ログ配列
     */
    async getAuditLogsByExecutionId(executionId: string, limit: number = 100): Promise<AuditLog[]> {
        try {
            logger.debug('Searching audit logs by execution ID', {
                executionId,
                limit
            });

            const auditLogs = await this.auditLogRepository.getAuditLogsByExecutionId(executionId, limit);

            logger.debug('Audit logs retrieved by execution ID', {
                executionId,
                logCount: auditLogs.length
            });

            return auditLogs;

        } catch (error) {
            logger.error('Failed to retrieve audit logs by execution ID', {
                executionId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * イベントタイプ別監査ログ統計取得
     * @param eventType イベントタイプ
     * @param startDate 開始日時
     * @param endDate 終了日時
     * @returns ログ統計情報
     */
    async getAuditLogStatistics(
        eventType?: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<{
        totalLogs: number;
        logsByLevel: Record<string, number>;
        logsByEventType: Record<string, number>;
        errorRate: number;
        period: {
            start: string;
            end: string;
        };
    }> {
        try {
            const start = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000); // デフォルト24時間前
            const end = endDate || new Date();

            logger.debug('Retrieving audit log statistics', {
                eventType,
                startDate: start.toISOString(),
                endDate: end.toISOString()
            });

            // リポジトリから統計情報を取得
            const stats = await this.auditLogRepository.getLogStatistics(eventType, start, end);

            const errorRate = stats.totalLogs > 0 
                ? Math.round((stats.logsByLevel.ERROR || 0) / stats.totalLogs * 100)
                : 0;

            const result = {
                totalLogs: stats.totalLogs,
                logsByLevel: stats.logsByLevel,
                logsByEventType: stats.logsByEventType,
                errorRate,
                period: {
                    start: start.toISOString(),
                    end: end.toISOString()
                }
            };

            logger.debug('Audit log statistics retrieved', {
                totalLogs: result.totalLogs,
                errorRate: result.errorRate
            });

            return result;

        } catch (error) {
            logger.error('Failed to retrieve audit log statistics', {
                eventType,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * 処理メタデータのログ統計更新
     */
    private async updateProcessingMetadataLogStats(
        executionId: string,
        logLevel: string,
        eventType: string
    ): Promise<void> {
        try {
            // 既存のメタデータを取得
            const existingMetadata = await this.processingMetadataRepository.getByExecutionId(executionId);

            let metadata: ProcessingMetadata;

            if (existingMetadata) {
                // 既存メタデータのログ統計を更新
                const currentLogStats = existingMetadata.metadata.logStatistics || {
                    totalLogs: 0,
                    debugLogs: 0,
                    infoLogs: 0,
                    warnLogs: 0,
                    errorLogs: 0
                };

                currentLogStats.totalLogs += 1;
                switch (logLevel) {
                    case 'DEBUG':
                        currentLogStats.debugLogs += 1;
                        break;
                    case 'INFO':
                        currentLogStats.infoLogs += 1;
                        break;
                    case 'WARN':
                        currentLogStats.warnLogs += 1;
                        break;
                    case 'ERROR':
                        currentLogStats.errorLogs += 1;
                        break;
                }

                metadata = new ProcessingMetadata(
                    existingMetadata.executionId,
                    existingMetadata.functionName,
                    existingMetadata.eventType,
                    existingMetadata.status,
                    {
                        ...this.sanitizeMetadataForDynamoDB(existingMetadata.metadata),
                        logStatistics: currentLogStats,
                        lastLogRecorded: new Date().toISOString(),
                        lastLogLevel: logLevel,
                        lastLogEventType: eventType
                    },
                    existingMetadata.ttlDays
                );
            } else {
                // 新規メタデータ作成
                const initialLogStats = {
                    totalLogs: 1,
                    debugLogs: logLevel === 'DEBUG' ? 1 : 0,
                    infoLogs: logLevel === 'INFO' ? 1 : 0,
                    warnLogs: logLevel === 'WARN' ? 1 : 0,
                    errorLogs: logLevel === 'ERROR' ? 1 : 0
                };

                metadata = new ProcessingMetadata(
                    executionId,
                    'csv-processor',
                    eventType,
                    'IN_PROGRESS',
                    {
                        logStatistics: initialLogStats,
                        firstLogRecorded: new Date().toISOString(),
                        lastLogRecorded: new Date().toISOString(),
                        lastLogLevel: logLevel,
                        lastLogEventType: eventType
                    },
                    30 // 30日間保持
                );
            }

            await this.processingMetadataRepository.save(metadata);

        } catch (error) {
            // メタデータ更新エラーは警告レベル（ログ記録自体は成功とみなす）
            logger.warn('Failed to update processing metadata log statistics', {
                executionId,
                logLevel,
                eventType,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * バッチメタデータ記録
     */
    private async recordBatchMetadata(
        batchId: string,
        executionId: string,
        batchStats: {
            totalProcessed: number;
            successCount: number;
            errorCount: number;
            batchType: string;
        }
    ): Promise<void> {
        try {
            const batchMetadata = new ProcessingMetadata(
                batchId,
                'csv-processor',
                'AUDIT_LOG_BATCH',
                batchStats.errorCount === 0 ? 'COMPLETED' : 'COMPLETED_WITH_ERRORS',
                {
                    parentExecutionId: executionId,
                    batchType: batchStats.batchType,
                    batchSize: batchStats.totalProcessed,
                    successCount: batchStats.successCount,
                    errorCount: batchStats.errorCount,
                    successRate: Math.round((batchStats.successCount / batchStats.totalProcessed) * 100),
                    processingTimestamp: new Date().toISOString()
                },
                7 // バッチメタデータは7日間保持
            );

            await this.processingMetadataRepository.save(batchMetadata);

        } catch (error) {
            logger.warn('Failed to record batch metadata', {
                batchId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * DynamoDB保存用にメタデータを安全化（Date型をISO文字列に変換）
     * @param metadata 原始メタデータ
     * @returns 安全化されたメタデータ
     */
    private sanitizeMetadataForDynamoDB(metadata: Record<string, any>): Record<string, any> {
        const sanitized: Record<string, any> = {};
        
        for (const [key, value] of Object.entries(metadata)) {
            if (value instanceof Date) {
                sanitized[key] = value.toISOString();
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                sanitized[key] = this.sanitizeMetadataForDynamoDB(value);
            } else {
                sanitized[key] = value;
            }
        }
        
        return sanitized;
    }
}