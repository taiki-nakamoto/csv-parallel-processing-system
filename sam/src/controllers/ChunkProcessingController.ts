import { Logger } from '@aws-lambda-powertools/logger';
import { ChunkProcessingService } from '../application/services/ChunkProcessingService';
import { EventParser } from '../utils/EventParser';
import { ErrorHandler } from '../utils/ErrorHandler';

/**
 * チャンク処理コントローラー
 * Step Functions分散マップからのイベントを受信し、25レコード単位のバッチ処理を制御
 */
export class ChunkProcessingController {
    private readonly logger = new Logger({ serviceName: 'ChunkProcessingController' });

    constructor(
        private readonly chunkProcessingService: ChunkProcessingService
    ) {}

    /**
     * 分散マップからのチャンクデータを処理
     * @param event Step Functions分散マップからのイベント
     * @returns 処理結果とメトリクス
     */
    async processChunk(event: any): Promise<any> {
        const correlationId = event.executionId || event.batchId || 'unknown';
        this.logger.addContext({ correlationId });

        try {
            // イベントバリデーションとパース
            const chunkData = this.validateAndParseEvent(event);
            
            this.logger.info('Chunk processing started', {
                batchId: chunkData.batchId,
                itemCount: chunkData.items.length,
                chunkIndex: chunkData.chunkIndex
            });

            // チャンク処理実行
            const result = await this.chunkProcessingService.processChunk(chunkData);

            this.logger.info('Chunk processing completed', {
                batchId: chunkData.batchId,
                processedCount: result.processedCount,
                successCount: result.successCount,
                errorCount: result.errorCount,
                processingTimeMs: result.processingTimeMs
            });

            // レスポンス生成
            return this.formatResponse(result);

        } catch (error) {
            this.logger.error('Chunk processing failed', {
                error: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
                eventData: JSON.stringify(event, null, 2).substring(0, 1000) // 最初の1000文字のみ
            });

            return ErrorHandler.handleError(error, event);
        }
    }

    /**
     * イベントデータのバリデーションとパース
     */
    private validateAndParseEvent(event: any): ChunkEventData {
        // 必須フィールドのチェック
        if (!event.batchId) {
            throw new Error('Missing required field: batchId');
        }

        if (!event.items || !Array.isArray(event.items)) {
            throw new Error('Missing or invalid required field: items (must be array)');
        }

        if (event.items.length === 0) {
            throw new Error('Items array cannot be empty');
        }

        if (event.items.length > 25) {
            throw new Error(`Items array too large: ${event.items.length} (max 25)`);
        }

        // 実行コンテキストの抽出
        const executionContext = event.executionContext || {};
        
        return {
            batchId: event.batchId,
            chunkIndex: event.chunkIndex || 0,
            items: event.items,
            executionId: executionContext.executionId || event.executionId || 'unknown',
            timestamp: executionContext.timestamp || new Date().toISOString(),
            processingConfig: {
                retryOnConflict: event.processingConfig?.retryOnConflict || true,
                batchTimeout: event.processingConfig?.batchTimeout || 30,
                maxRetries: event.processingConfig?.maxRetries || 3
            }
        };
    }

    /**
     * 処理結果のフォーマット
     */
    private formatResponse(result: ChunkProcessingResult): any {
        return {
            statusCode: 200,
            batchId: result.batchId,
            chunkIndex: result.chunkIndex,
            processedCount: result.processedCount,
            successCount: result.successCount,
            errorCount: result.errorCount,
            processingTimeMs: result.processingTimeMs,
            summary: {
                successRate: result.processedCount > 0 
                    ? Math.round((result.successCount / result.processedCount) * 100 * 100) / 100 
                    : 0,
                averageProcessingTimePerRecord: result.processedCount > 0 
                    ? Math.round((result.processingTimeMs / result.processedCount) * 100) / 100 
                    : 0
            },
            results: result.results,
            errors: result.errors,
            metadata: {
                executionId: result.executionId,
                processingTimestamp: result.processingTimestamp,
                chunkSize: result.processedCount,
                hasErrors: result.errorCount > 0
            }
        };
    }
}

/**
 * チャンクイベントデータの型定義
 */
export interface ChunkEventData {
    batchId: string;
    chunkIndex: number;
    items: ChunkItem[];
    executionId: string;
    timestamp: string;
    processingConfig: {
        retryOnConflict: boolean;
        batchTimeout: number;
        maxRetries: number;
    };
}

/**
 * チャンクアイテムの型定義
 */
export interface ChunkItem {
    index: number;
    data: Record<string, string>;
    metadata?: {
        sourceFile?: string;
        processingTime?: string;
        lineNumber?: number;
    };
}

/**
 * チャンク処理結果の型定義
 */
export interface ChunkProcessingResult {
    batchId: string;
    chunkIndex: number;
    executionId: string;
    processedCount: number;
    successCount: number;
    errorCount: number;
    processingTimeMs: number;
    processingTimestamp: string;
    results: ProcessingItemResult[];
    errors: ProcessingItemError[];
}

/**
 * 個別アイテム処理結果
 */
export interface ProcessingItemResult {
    itemIndex: number;
    userId: string;
    status: 'SUCCESS';
    processingTimeMs: number;
    updatedFields?: {
        loginCount?: number;
        postCount?: number;
    };
}

/**
 * 個別アイテム処理エラー
 */
export interface ProcessingItemError {
    itemIndex: number;
    userId?: string;
    status: 'ERROR';
    error: string;
    errorType: string;
    processingTimeMs: number;
    retryable: boolean;
}