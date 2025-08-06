import { Logger } from '@aws-lambda-powertools/logger';
import { IUserRepository } from '../../domain/interfaces/IUserRepository';
import { IAuditLogRepository } from '../../domain/interfaces/IAuditLogRepository';
import { ChunkProcessor } from '../../domain/services/ChunkProcessor';
import { AuditLog } from '../../domain/models/AuditLog';
import { 
    ChunkEventData, 
    ChunkProcessingResult, 
    ProcessingItemResult, 
    ProcessingItemError,
    ChunkItem
} from '../../controllers/ChunkProcessingController';

/**
 * チャンク処理サービス（アプリケーション層）
 * 25レコード単位のバッチ処理を並列実行で管理
 */
export class ChunkProcessingService {
    private readonly logger = new Logger({ serviceName: 'ChunkProcessingService' });
    private readonly MAX_PARALLEL_WORKERS = 5; // 設計書準拠
    private readonly PROCESSING_TIMEOUT_MS = 30000; // 30秒

    constructor(
        private readonly userRepository: IUserRepository,
        private readonly auditRepository: IAuditLogRepository,
        private readonly chunkProcessor: ChunkProcessor
    ) {}

    /**
     * チャンクデータの処理実行
     * 25レコードを5並列ワーカーで処理
     */
    async processChunk(chunkData: ChunkEventData): Promise<ChunkProcessingResult> {
        const startTime = Date.now();
        const processingTimestamp = new Date().toISOString();

        this.logger.info('Starting chunk processing', {
            batchId: chunkData.batchId,
            chunkIndex: chunkData.chunkIndex,
            itemCount: chunkData.items.length,
            executionId: chunkData.executionId
        });

        try {
            // 並列処理実行（スレッドプール的に5並列）
            const { results, errors } = await this.processItemsInParallel(
                chunkData.items, 
                chunkData.executionId,
                chunkData.batchId
            );

            // 処理メトリクス計算
            const processingTimeMs = Date.now() - startTime;
            const processedCount = results.length + errors.length;
            const successCount = results.length;
            const errorCount = errors.length;

            // 監査ログ記録（バッチサマリー）
            await this.recordBatchAuditLog(chunkData, {
                processedCount,
                successCount,
                errorCount,
                processingTimeMs
            });

            // エラー率チェック（5%許容率）
            const errorRate = processedCount > 0 ? (errorCount / processedCount) * 100 : 0;
            if (errorRate > 5) {
                this.logger.warn('Error rate exceeds tolerance', {
                    errorRate,
                    errorCount,
                    processedCount,
                    batchId: chunkData.batchId
                });
            }

            this.logger.info('Chunk processing completed', {
                batchId: chunkData.batchId,
                processedCount,
                successCount,
                errorCount,
                errorRate: Math.round(errorRate * 100) / 100,
                processingTimeMs
            });

            return {
                batchId: chunkData.batchId,
                chunkIndex: chunkData.chunkIndex,
                executionId: chunkData.executionId,
                processedCount,
                successCount,
                errorCount,
                processingTimeMs,
                processingTimestamp,
                results,
                errors
            };

        } catch (error) {
            const processingTimeMs = Date.now() - startTime;
            
            this.logger.error('Chunk processing failed', {
                batchId: chunkData.batchId,
                error: error instanceof Error ? error.message : String(error),
                processingTimeMs
            });

            // 失敗時の監査ログ記録
            await this.recordFailureAuditLog(chunkData, error, processingTimeMs);

            throw error;
        }
    }

    /**
     * アイテムの並列処理実行
     * 5並列ワーカーでの処理を管理
     */
    private async processItemsInParallel(
        items: ChunkItem[],
        executionId: string,
        batchId: string
    ): Promise<{ results: ProcessingItemResult[]; errors: ProcessingItemError[] }> {
        const results: ProcessingItemResult[] = [];
        const errors: ProcessingItemError[] = [];
        
        // 5並列で処理するためのワーカープール実装
        const concurrentPromises: Promise<void>[] = [];
        const semaphore = new Semaphore(this.MAX_PARALLEL_WORKERS);

        // 全アイテムを並列処理
        for (const item of items) {
            const promise = semaphore.acquire().then(async (release) => {
                try {
                    const result = await this.processIndividualItem(item, executionId, batchId);
                    results.push(result);
                } catch (error) {
                    const processingError = this.createProcessingError(item, error);
                    errors.push(processingError);
                } finally {
                    release();
                }
            });

            concurrentPromises.push(promise);
        }

        // 全ての処理完了を待機
        await Promise.all(concurrentPromises);

        return { results, errors };
    }

    /**
     * 個別アイテムの処理
     * トランザクション管理とドメインロジック適用
     */
    private async processIndividualItem(
        item: ChunkItem,
        executionId: string,
        batchId: string
    ): Promise<ProcessingItemResult> {
        const itemStartTime = Date.now();

        try {
            // ドメイン層でのCSVデータ処理
            const userLogData = await this.chunkProcessor.processUserLogData(
                item.data, 
                item.index
            );

            // ユーザーの取得
            const existingUser = await this.userRepository.findById(userLogData.userId);
            if (!existingUser) {
                throw new UserNotFoundError(`User not found: ${userLogData.userId}`);
            }

            // ドメインロジックでの統計更新
            const updatedUser = await this.chunkProcessor.updateUserStatistics(
                existingUser,
                userLogData.loginIncrement,
                userLogData.postIncrement
            );

            // Aurora PostgreSQLへの更新（トランザクション管理）
            await this.userRepository.update(updatedUser);

            // 個別レコード監査ログ
            await this.recordItemSuccessAuditLog(
                item,
                executionId,
                batchId,
                userLogData.userId
            );

            const processingTimeMs = Date.now() - itemStartTime;

            return {
                itemIndex: item.index,
                userId: userLogData.userId,
                status: 'SUCCESS',
                processingTimeMs,
                updatedFields: {
                    loginCount: updatedUser.statistics.loginCount,
                    postCount: updatedUser.statistics.postCount
                }
            };

        } catch (error) {
            const processingTimeMs = Date.now() - itemStartTime;

            // エラー監査ログ記録
            await this.recordItemErrorAuditLog(
                item,
                executionId,
                batchId,
                error,
                processingTimeMs
            );

            throw error;
        }
    }

    /**
     * 処理エラーオブジェクトの作成
     */
    private createProcessingError(item: ChunkItem, error: any): ProcessingItemError {
        const errorType = error.constructor?.name || 'UnknownError';
        const isRetryable = this.isRetryableError(error);

        return {
            itemIndex: item.index,
            userId: item.data['ユーザーID'],
            status: 'ERROR',
            error: error instanceof Error ? error.message : String(error),
            errorType,
            processingTimeMs: 0, // エラー時は計測困難
            retryable: isRetryable
        };
    }

    /**
     * エラーのリトライ可否判定
     */
    private isRetryableError(error: any): boolean {
        // Business Logic Errorはリトライ不可
        if (error instanceof UserNotFoundError || 
            error instanceof ValidationError) {
            return false;
        }

        // Database Connection Error等はリトライ可能
        if (error.code === 'ECONNRESET' || 
            error.code === 'ETIMEDOUT' ||
            error.message?.includes('Connection')) {
            return true;
        }

        // デフォルトはリトライ可能
        return true;
    }

    /**
     * バッチサマリー監査ログ記録
     */
    private async recordBatchAuditLog(
        chunkData: ChunkEventData,
        metrics: {
            processedCount: number;
            successCount: number;
            errorCount: number;
            processingTimeMs: number;
        }
    ): Promise<void> {
        try {
            const auditLog = AuditLog.create({
                executionId: chunkData.executionId,
                logLevel: 'INFO',
                eventType: 'CHUNK_BATCH_COMPLETED',
                message: `Batch processing completed for chunk ${chunkData.chunkIndex}`,
                details: {
                    batchId: chunkData.batchId,
                    chunkIndex: chunkData.chunkIndex,
                    metrics,
                    itemCount: chunkData.items.length
                },
                sourceComponent: 'ChunkProcessingService',
                correlationId: chunkData.batchId
            });

            await this.auditRepository.log(auditLog);
        } catch (error) {
            this.logger.warn('Failed to record batch audit log', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * 個別アイテム成功監査ログ記録
     */
    private async recordItemSuccessAuditLog(
        item: ChunkItem,
        executionId: string,
        batchId: string,
        userId: string
    ): Promise<void> {
        try {
            const auditLog = AuditLog.create({
                executionId,
                logLevel: 'DEBUG',
                eventType: 'ITEM_PROCESSED_SUCCESS',
                message: `Successfully processed item ${item.index} for user ${userId}`,
                details: {
                    batchId,
                    itemIndex: item.index,
                    userId,
                    sourceData: item.data
                },
                sourceComponent: 'ChunkProcessingService',
                correlationId: batchId
            });

            await this.auditRepository.log(auditLog);
        } catch (error) {
            this.logger.warn('Failed to record item success audit log', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * 個別アイテムエラー監査ログ記録
     */
    private async recordItemErrorAuditLog(
        item: ChunkItem,
        executionId: string,
        batchId: string,
        error: any,
        processingTimeMs: number
    ): Promise<void> {
        try {
            const auditLog = AuditLog.create({
                executionId,
                logLevel: 'ERROR',
                eventType: 'ITEM_PROCESSED_ERROR',
                message: `Failed to process item ${item.index}: ${error instanceof Error ? error.message : String(error)}`,
                details: {
                    batchId,
                    itemIndex: item.index,
                    userId: item.data['ユーザーID'],
                    error: error instanceof Error ? error.message : String(error),
                    errorType: error.constructor?.name || 'UnknownError',
                    processingTimeMs,
                    sourceData: item.data
                },
                sourceComponent: 'ChunkProcessingService',
                correlationId: batchId
            });

            await this.auditRepository.log(auditLog);
        } catch (auditError) {
            this.logger.warn('Failed to record item error audit log', {
                error: auditError instanceof Error ? auditError.message : String(auditError)
            });
        }
    }

    /**
     * 失敗時監査ログ記録
     */
    private async recordFailureAuditLog(
        chunkData: ChunkEventData,
        error: any,
        processingTimeMs: number
    ): Promise<void> {
        try {
            const auditLog = AuditLog.create({
                executionId: chunkData.executionId,
                logLevel: 'ERROR',
                eventType: 'CHUNK_PROCESSING_FAILED',
                message: `Chunk processing failed: ${error instanceof Error ? error.message : String(error)}`,
                details: {
                    batchId: chunkData.batchId,
                    chunkIndex: chunkData.chunkIndex,
                    error: error instanceof Error ? error.message : String(error),
                    errorType: error.constructor?.name || 'UnknownError',
                    processingTimeMs,
                    itemCount: chunkData.items.length
                },
                sourceComponent: 'ChunkProcessingService',
                correlationId: chunkData.batchId
            });

            await this.auditRepository.log(auditLog);
        } catch (auditError) {
            this.logger.warn('Failed to record failure audit log', {
                error: auditError instanceof Error ? auditError.message : String(auditError)
            });
        }
    }
}

/**
 * セマフォ実装（並列度制御）
 */
class Semaphore {
    private permits: number;
    private waitQueue: Array<() => void> = [];

    constructor(permits: number) {
        this.permits = permits;
    }

    async acquire(): Promise<() => void> {
        if (this.permits > 0) {
            this.permits--;
            return () => this.release();
        }

        return new Promise((resolve) => {
            this.waitQueue.push(() => {
                this.permits--;
                resolve(() => this.release());
            });
        });
    }

    private release(): void {
        this.permits++;
        if (this.waitQueue.length > 0) {
            const nextWaiter = this.waitQueue.shift()!;
            nextWaiter();
        }
    }
}

/**
 * カスタムエラークラス
 */
export class UserNotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UserNotFoundError';
    }
}

export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

/**
 * ユーザーログデータの型定義
 */
export interface UserLogData {
    userId: string;
    loginIncrement: number;
    postIncrement: number;
}