import { Logger } from '@aws-lambda-powertools/logger';
import { ResultAggregator } from '../../domain/services/ResultAggregator';
import { ResultRepository } from '../../infrastructure/repositories/ResultRepository';
import { IAuditLogRepository } from '../../domain/interfaces/IAuditLogRepository';
import { AuditLog } from '../../domain/models/AuditLog';
import { 
    AggregationEventData, 
    AggregatedResult,
    MapResult,
    MapStatistics,
    ErrorAnalysis
} from '../../controllers/ResultAggregationController';

/**
 * 結果集約サービス（アプリケーション層）
 * 分散マップ結果の集約、メトリクス計算、レポート生成を管理
 */
export class ResultAggregationService {
    private readonly logger = new Logger({ serviceName: 'ResultAggregationService' });

    constructor(
        private readonly resultAggregator: ResultAggregator,
        private readonly resultRepository: ResultRepository,
        private readonly auditRepository: IAuditLogRepository
    ) {}

    /**
     * 分散マップ結果の集約実行
     * @param aggregationData 集約対象データ
     * @returns 集約結果
     */
    async aggregateMapResults(aggregationData: AggregationEventData): Promise<AggregatedResult> {
        const startTime = Date.now();
        const aggregationTimestamp = new Date().toISOString();

        this.logger.info('Starting map results aggregation', {
            executionId: aggregationData.executionId,
            totalItems: aggregationData.statistics.totalItems,
            resultsCount: aggregationData.results.length
        });

        try {
            // 基本統計の計算
            const basicStats = this.calculateBasicStatistics(
                aggregationData.statistics, 
                aggregationData.results
            );

            // パフォーマンスメトリクスの計算
            const performanceMetrics = this.calculatePerformanceMetrics(
                aggregationData.results,
                aggregationData.statistics.processingDurationSeconds
            );

            // エラー分析の実行
            const errorAnalysis = await this.resultAggregator.analyzeErrors(aggregationData.results);

            // 品質メトリクスの計算
            const qualityMetrics = this.calculateQualityMetrics(
                basicStats,
                performanceMetrics,
                errorAnalysis
            );

            // 推奨事項の生成
            const recommendations = await this.resultAggregator.generateRecommendations({
                statistics: aggregationData.statistics,
                results: aggregationData.results,
                errorAnalysis,
                performanceMetrics
            });

            // 集約結果の構築
            const aggregatedResult: AggregatedResult = {
                executionId: aggregationData.executionId,
                mapRunId: aggregationData.metadata.mapRunId,
                totalProcessed: basicStats.totalProcessed,
                successCount: basicStats.successCount,
                errorCount: basicStats.errorCount,
                successRate: basicStats.successRate,
                errorRate: basicStats.errorRate,
                processingTimeSeconds: aggregationData.statistics.processingDurationSeconds,
                throughputRecordsPerSecond: performanceMetrics.throughputRecordsPerSecond,
                averageProcessingTimePerBatch: performanceMetrics.averageProcessingTimePerBatch,
                maxProcessingTimePerBatch: performanceMetrics.maxProcessingTimePerBatch,
                minProcessingTimePerBatch: performanceMetrics.minProcessingTimePerBatch,
                errorAnalysis,
                outputLocation: {
                    s3Bucket: '',
                    s3Key: '',
                    compressedSize: 0,
                    uncompressedSize: 0
                },
                recommendations,
                aggregationTimestamp,
                aggregationDurationMs: Date.now() - startTime,
                executionArn: aggregationData.metadata.executionArn
            };

            // S3への結果保存
            const outputLocation = await this.resultRepository.saveAggregatedResult(
                aggregatedResult,
                aggregationData.metadata.outputBucket
            );

            // 出力場所を更新
            aggregatedResult.outputLocation = outputLocation;

            // Aurora PostgreSQLへの集約結果保存
            await this.resultRepository.saveExecutionSummary({
                executionId: aggregationData.executionId,
                status: basicStats.errorRate > 10 ? 'FAILED' : 'SUCCEEDED',
                totalRecords: basicStats.totalProcessed,
                successRecords: basicStats.successCount,
                errorRecords: basicStats.errorCount,
                processingTimeSeconds: aggregationData.statistics.processingDurationSeconds,
                executionOutput: {
                    aggregationSummary: {
                        successRate: basicStats.successRate,
                        throughput: performanceMetrics.throughputRecordsPerSecond,
                        errorRate: basicStats.errorRate
                    },
                    outputLocation: outputLocation.s3Key
                },
                errorDetails: errorAnalysis.criticalErrors.length > 0 ? {
                    criticalErrors: errorAnalysis.criticalErrors,
                    errorsByType: errorAnalysis.errorsByType
                } : undefined
            });

            // 監査ログ記録
            await this.recordAggregationAuditLog(aggregationData.executionId, aggregatedResult, 'SUCCESS');

            this.logger.info('Map results aggregation completed successfully', {
                executionId: aggregationData.executionId,
                totalProcessed: basicStats.totalProcessed,
                successRate: basicStats.successRate,
                aggregationDurationMs: aggregatedResult.aggregationDurationMs,
                outputLocation: outputLocation.s3Key
            });

            return aggregatedResult;

        } catch (error) {
            const aggregationDurationMs = Date.now() - startTime;
            
            this.logger.error('Map results aggregation failed', {
                executionId: aggregationData.executionId,
                error: error instanceof Error ? error.message : String(error),
                aggregationDurationMs
            });

            // 失敗時の監査ログ記録
            await this.recordAggregationAuditLog(
                aggregationData.executionId, 
                null, 
                'FAILED', 
                error
            );

            throw error;
        }
    }

    /**
     * 基本統計の計算
     */
    private calculateBasicStatistics(
        mapStats: MapStatistics,
        results: MapResult[]
    ): BasicStatistics {
        const totalProcessed = mapStats.processedItems;
        const successCount = results.reduce((sum, result) => sum + result.successCount, 0);
        const errorCount = results.reduce((sum, result) => sum + result.errorCount, 0);
        
        const successRate = totalProcessed > 0 ? Math.round((successCount / totalProcessed) * 100 * 100) / 100 : 0;
        const errorRate = totalProcessed > 0 ? Math.round((errorCount / totalProcessed) * 100 * 100) / 100 : 0;

        return {
            totalProcessed,
            successCount,
            errorCount,
            successRate,
            errorRate
        };
    }

    /**
     * パフォーマンスメトリクスの計算
     */
    private calculatePerformanceMetrics(
        results: MapResult[],
        totalProcessingTimeSeconds: number
    ): PerformanceMetrics {
        const processingTimes = results
            .map(result => result.processingTimeMs)
            .filter(time => time > 0);

        const averageProcessingTimePerBatch = processingTimes.length > 0
            ? Math.round((processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length) * 100) / 100
            : 0;

        const maxProcessingTimePerBatch = processingTimes.length > 0
            ? Math.max(...processingTimes)
            : 0;

        const minProcessingTimePerBatch = processingTimes.length > 0
            ? Math.min(...processingTimes)
            : 0;

        const totalRecords = results.reduce((sum, result) => sum + result.successCount + result.errorCount, 0);
        const throughputRecordsPerSecond = totalProcessingTimeSeconds > 0
            ? Math.round((totalRecords / totalProcessingTimeSeconds) * 100) / 100
            : 0;

        return {
            averageProcessingTimePerBatch,
            maxProcessingTimePerBatch,
            minProcessingTimePerBatch,
            throughputRecordsPerSecond
        };
    }

    /**
     * 品質メトリクスの計算
     */
    private calculateQualityMetrics(
        basicStats: BasicStatistics,
        performanceMetrics: PerformanceMetrics,
        errorAnalysis: ErrorAnalysis
    ): QualityMetrics {
        // データ品質スコア（0-100）
        let qualityScore = 100;
        
        // エラー率によるペナルティ
        if (basicStats.errorRate > 10) qualityScore -= 40;
        else if (basicStats.errorRate > 5) qualityScore -= 20;
        else if (basicStats.errorRate > 1) qualityScore -= 10;

        // 重大エラーによるペナルティ
        if (errorAnalysis.criticalErrors.length > 0) qualityScore -= 30;

        // パフォーマンスによる調整
        if (performanceMetrics.throughputRecordsPerSecond < 10) qualityScore -= 10;
        else if (performanceMetrics.throughputRecordsPerSecond > 100) qualityScore += 5;

        return {
            qualityScore: Math.max(0, qualityScore),
            dataIntegrityScore: basicStats.successRate,
            performanceScore: Math.min(100, performanceMetrics.throughputRecordsPerSecond)
        };
    }

    /**
     * 集約処理監査ログ記録
     */
    private async recordAggregationAuditLog(
        executionId: string,
        result: AggregatedResult | null,
        status: 'SUCCESS' | 'FAILED',
        error?: any
    ): Promise<void> {
        try {
            const auditLog = AuditLog.create({
                executionId,
                logLevel: status === 'SUCCESS' ? 'INFO' : 'ERROR',
                eventType: 'RESULT_AGGREGATION_COMPLETED',
                message: status === 'SUCCESS' 
                    ? `Result aggregation completed successfully`
                    : `Result aggregation failed: ${error instanceof Error ? error.message : String(error)}`,
                details: {
                    status,
                    aggregationResult: result ? {
                        totalProcessed: result.totalProcessed,
                        successRate: result.successRate,
                        errorRate: result.errorRate,
                        throughput: result.throughputRecordsPerSecond,
                        aggregationDurationMs: result.aggregationDurationMs
                    } : null,
                    error: status === 'FAILED' ? {
                        message: error instanceof Error ? error.message : String(error),
                        type: error?.constructor?.name || 'UnknownError'
                    } : null
                },
                sourceComponent: 'ResultAggregationService',
                correlationId: executionId
            });

            await this.auditRepository.log(auditLog);
        } catch (auditError) {
            this.logger.warn('Failed to record aggregation audit log', {
                error: auditError instanceof Error ? auditError.message : String(auditError)
            });
        }
    }
}

/**
 * 基本統計の型定義
 */
interface BasicStatistics {
    totalProcessed: number;
    successCount: number;
    errorCount: number;
    successRate: number;
    errorRate: number;
}

/**
 * パフォーマンスメトリクスの型定義
 */
interface PerformanceMetrics {
    averageProcessingTimePerBatch: number;
    maxProcessingTimePerBatch: number;
    minProcessingTimePerBatch: number;
    throughputRecordsPerSecond: number;
}

/**
 * 品質メトリクスの型定義
 */
interface QualityMetrics {
    qualityScore: number;
    dataIntegrityScore: number;
    performanceScore: number;
}