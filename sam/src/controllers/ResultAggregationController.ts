import { Logger } from '@aws-lambda-powertools/logger';
import { ResultAggregationService } from '../application/services/ResultAggregationService';
import { ErrorHandler } from '../utils/ErrorHandler';

/**
 * 結果集約コントローラー
 * Step Functions分散マップの処理結果を受信し、集約処理を制御
 */
export class ResultAggregationController {
    private readonly logger = new Logger({ serviceName: 'ResultAggregationController' });

    constructor(
        private readonly resultAggregationService: ResultAggregationService
    ) {}

    /**
     * 分散マップの結果を集約処理
     * @param event Step Functions分散マップからの結果イベント
     * @returns 集約結果とメトリクス
     */
    async aggregateResults(event: any): Promise<any> {
        const correlationId = event.executionId || event.execution?.id || 'unknown';
        this.logger.addContext({ correlationId });

        try {
            // イベントバリデーションとパース
            const aggregationData = this.validateAndParseEvent(event);
            
            this.logger.info('Result aggregation started', {
                executionId: aggregationData.executionId,
                mapRunId: aggregationData.mapRunId,
                resultsCount: aggregationData.results.length,
                totalItems: aggregationData.statistics.totalItems
            });

            // 結果集約実行
            const aggregatedResult = await this.resultAggregationService.aggregateMapResults(aggregationData);

            this.logger.info('Result aggregation completed', {
                executionId: aggregationData.executionId,
                totalProcessed: aggregatedResult.totalProcessed,
                successRate: aggregatedResult.successRate,
                processingTimeSeconds: aggregatedResult.processingTimeSeconds,
                outputLocation: aggregatedResult.outputLocation
            });

            // レスポンス生成
            return this.formatResponse(aggregatedResult);

        } catch (error) {
            this.logger.error('Result aggregation failed', {
                error: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
                eventData: JSON.stringify(event, null, 2).substring(0, 1000)
            });

            return ErrorHandler.handleLambdaError(
                error instanceof Error ? error : new Error(String(error)),
                {
                    executionId: event.processingId || event.executionId,
                    eventType: 'csv-merge',
                    isApiGateway: false
                }
            );
        }
    }

    /**
     * イベントデータのバリデーションとパース
     */
    private validateAndParseEvent(event: any): AggregationEventData {
        // Step Functions 分散マップからの基本フィールドチェック
        const executionId = event.executionId || event.execution?.id;
        if (!executionId) {
            throw new Error('Missing required field: executionId');
        }

        // 分散マップ統計情報の取得
        const statistics = this.extractMapStatistics(event);
        
        // 結果データの取得
        const results = this.extractMapResults(event);

        // メタデータの抽出
        const metadata = {
            mapRunId: event.mapRunId || event.Map?.Run?.Id || 'unknown',
            startTime: event.startTime || new Date().toISOString(),
            endTime: new Date().toISOString(),
            outputBucket: event.outputBucket || process.env.RESULT_BUCKET || 'csv-parallel-processing-results-dev',
            executionArn: event.executionArn || event.execution?.arn
        };

        return {
            executionId,
            statistics,
            results,
            metadata
        };
    }

    /**
     * 分散マップ統計情報の抽出
     */
    private extractMapStatistics(event: any): MapStatistics {
        // Step Functions distributed map の統計情報
        const mapStats = event.statistics || event.Map?.Stats || {};
        
        return {
            totalItems: mapStats.totalItems || mapStats.TotalItems || 0,
            processedItems: mapStats.processedItems || mapStats.Succeeded || 0,
            failedItems: mapStats.failedItems || mapStats.Failed || 0,
            timedOutItems: mapStats.timedOutItems || mapStats.TimedOut || 0,
            abortedItems: mapStats.abortedItems || mapStats.Aborted || 0,
            processingDurationSeconds: mapStats.processingDurationSeconds || mapStats.Duration || 0
        };
    }

    /**
     * 分散マップ結果データの抽出
     */
    private extractMapResults(event: any): MapResult[] {
        // Step Functions distributed map からの結果配列
        const rawResults = event.results || event.Items || [];
        
        if (!Array.isArray(rawResults)) {
            this.logger.warn('Results is not an array, attempting to convert', {
                resultsType: typeof rawResults
            });
            return [];
        }

        return rawResults.map((result, index) => ({
            itemIndex: result.itemIndex || index,
            status: result.status || (result.statusCode === 200 ? 'SUCCESS' : 'FAILED'),
            processingTimeMs: result.processingTimeMs || 0,
            successCount: result.successCount || 0,
            errorCount: result.errorCount || 0,
            errors: result.errors || [],
            metadata: result.metadata || {}
        }));
    }

    /**
     * 処理結果のフォーマット
     */
    private formatResponse(result: AggregatedResult): any {
        return {
            statusCode: 200,
            executionId: result.executionId,
            mapRunId: result.mapRunId,
            aggregationSummary: {
                totalProcessed: result.totalProcessed,
                successCount: result.successCount,
                errorCount: result.errorCount,
                successRate: result.successRate,
                processingTimeSeconds: result.processingTimeSeconds,
                throughputRecordsPerSecond: result.throughputRecordsPerSecond
            },
            qualityMetrics: {
                errorRate: result.errorRate,
                averageProcessingTimePerBatch: result.averageProcessingTimePerBatch,
                maxProcessingTimePerBatch: result.maxProcessingTimePerBatch,
                minProcessingTimePerBatch: result.minProcessingTimePerBatch
            },
            errorAnalysis: result.errorAnalysis,
            outputLocation: {
                s3Bucket: result.outputLocation.s3Bucket,
                s3Key: result.outputLocation.s3Key,
                compressedSize: result.outputLocation.compressedSize,
                uncompressedSize: result.outputLocation.uncompressedSize
            },
            recommendations: result.recommendations,
            metadata: {
                aggregationTimestamp: result.aggregationTimestamp,
                aggregationDurationMs: result.aggregationDurationMs,
                executionArn: result.executionArn
            }
        };
    }
}

/**
 * 集約イベントデータの型定義
 */
export interface AggregationEventData {
    executionId: string;
    statistics: MapStatistics;
    results: MapResult[];
    metadata: {
        mapRunId: string;
        startTime: string;
        endTime: string;
        outputBucket: string;
        executionArn?: string;
    };
}

/**
 * 分散マップ統計情報の型定義
 */
export interface MapStatistics {
    totalItems: number;
    processedItems: number;
    failedItems: number;
    timedOutItems: number;
    abortedItems: number;
    processingDurationSeconds: number;
}

/**
 * 分散マップ結果の型定義
 */
export interface MapResult {
    itemIndex: number;
    status: 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'ABORTED';
    processingTimeMs: number;
    successCount: number;
    errorCount: number;
    errors: any[];
    metadata: Record<string, any>;
}

/**
 * 集約結果の型定義
 */
export interface AggregatedResult {
    executionId: string;
    mapRunId: string;
    totalProcessed: number;
    successCount: number;
    errorCount: number;
    successRate: number;
    errorRate: number;
    processingTimeSeconds: number;
    throughputRecordsPerSecond: number;
    averageProcessingTimePerBatch: number;
    maxProcessingTimePerBatch: number;
    minProcessingTimePerBatch: number;
    errorAnalysis: ErrorAnalysis;
    outputLocation: {
        s3Bucket: string;
        s3Key: string;
        compressedSize: number;
        uncompressedSize: number;
    };
    recommendations: string[];
    aggregationTimestamp: string;
    aggregationDurationMs: number;
    executionArn?: string;
}

/**
 * エラー分析の型定義
 */
export interface ErrorAnalysis {
    errorsByType: Record<string, number>;
    topErrors: Array<{ errorType: string; count: number; percentage: number }>;
    retryableErrors: number;
    nonRetryableErrors: number;
    criticalErrors: string[];
}