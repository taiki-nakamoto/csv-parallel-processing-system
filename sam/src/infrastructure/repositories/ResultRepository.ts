import { S3Client, PutObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3';
import { Logger } from '@aws-lambda-powertools/logger';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { RdsUserRepository } from './RdsUserRepository';
import { AggregatedResult } from '../../controllers/ResultAggregationController';

/**
 * 結果保存リポジトリ（インフラストラクチャ層）
 * S3とAurora PostgreSQLへの結果保存を担当
 */
export class ResultRepository {
    private readonly logger = new Logger({ serviceName: 'ResultRepository' });
    private readonly s3Client: S3Client;
    private readonly rdsRepository: RdsUserRepository;

    constructor() {
        this.s3Client = new S3Client({
            region: process.env.AWS_REGION || 'ap-northeast-1',
            maxAttempts: 3
        });
        this.rdsRepository = new RdsUserRepository();
    }

    /**
     * 集約結果をS3に保存（圧縮JSON形式）
     * @param aggregatedResult 集約結果
     * @param outputBucket 出力先S3バケット
     * @returns S3保存場所情報
     */
    async saveAggregatedResult(
        aggregatedResult: AggregatedResult,
        outputBucket: string
    ): Promise<{
        s3Bucket: string;
        s3Key: string;
        compressedSize: number;
        uncompressedSize: number;
    }> {
        const startTime = Date.now();
        
        try {
            // S3キー生成（実行日時とIDでパーティション）
            const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const s3Key = `results/${timestamp}/${aggregatedResult.executionId}/${aggregatedResult.mapRunId}/aggregated-result.json.gz`;

            // JSON データ準備
            const jsonData = JSON.stringify(aggregatedResult, null, 2);
            const uncompressedSize = Buffer.byteLength(jsonData, 'utf8');

            // gzip圧縮
            const compressedBuffer = zlib.gzipSync(jsonData, {
                level: zlib.constants.Z_BEST_COMPRESSION
            });
            const compressedSize = compressedBuffer.length;

            // MD5ハッシュ計算（データ整合性確認用）
            const md5Hash = crypto.createHash('md5').update(compressedBuffer).digest('hex');

            // S3アップロード設定
            const putObjectParams: PutObjectCommandInput = {
                Bucket: outputBucket,
                Key: s3Key,
                Body: compressedBuffer,
                ContentType: 'application/json',
                ContentEncoding: 'gzip',
                Metadata: {
                    'execution-id': aggregatedResult.executionId,
                    'map-run-id': aggregatedResult.mapRunId,
                    'total-processed': aggregatedResult.totalProcessed.toString(),
                    'success-rate': aggregatedResult.successRate.toString(),
                    'error-rate': aggregatedResult.errorRate.toString(),
                    'uncompressed-size': uncompressedSize.toString(),
                    'compressed-size': compressedSize.toString(),
                    'aggregation-timestamp': aggregatedResult.aggregationTimestamp,
                    'md5-hash': md5Hash
                },
                StorageClass: 'STANDARD_IA', // コスト最適化（30日後にIA）
                ServerSideEncryption: 'AES256' // 暗号化
            };

            // S3アップロード実行
            const command = new PutObjectCommand(putObjectParams);
            await this.s3Client.send(command);

            const uploadDuration = Date.now() - startTime;
            
            this.logger.info('Aggregated result saved to S3 successfully', {
                executionId: aggregatedResult.executionId,
                s3Bucket: outputBucket,
                s3Key,
                uncompressedSize,
                compressedSize,
                compressionRatio: Math.round((1 - compressedSize / uncompressedSize) * 100),
                uploadDurationMs: uploadDuration
            });

            return {
                s3Bucket: outputBucket,
                s3Key,
                compressedSize,
                uncompressedSize
            };

        } catch (error) {
            const uploadDuration = Date.now() - startTime;
            
            this.logger.error('Failed to save aggregated result to S3', {
                executionId: aggregatedResult.executionId,
                outputBucket,
                error: error instanceof Error ? error.message : String(error),
                uploadDurationMs: uploadDuration
            });

            throw new S3SaveError(
                `Failed to save aggregated result to S3: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * 実行サマリーをAurora PostgreSQLに保存
     * @param executionSummary 実行サマリー情報
     */
    async saveExecutionSummary(executionSummary: {
        executionId: string;
        status: 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
        totalRecords: number;
        successRecords: number;
        errorRecords: number;
        processingTimeSeconds: number;
        executionOutput?: any;
        errorDetails?: any;
    }): Promise<void> {
        try {
            // Aurora PostgreSQLのストアドプロシージャを使用
            await this.rdsRepository.completeProcessingExecution(
                executionSummary.executionId,
                executionSummary.status,
                executionSummary.totalRecords,
                executionSummary.successRecords,
                executionSummary.errorRecords,
                executionSummary.executionOutput ? JSON.stringify(executionSummary.executionOutput) : undefined,
                executionSummary.errorDetails ? JSON.stringify(executionSummary.errorDetails) : undefined
            );

            this.logger.info('Execution summary saved to Aurora PostgreSQL successfully', {
                executionId: executionSummary.executionId,
                status: executionSummary.status,
                totalRecords: executionSummary.totalRecords,
                successRate: executionSummary.totalRecords > 0 
                    ? Math.round((executionSummary.successRecords / executionSummary.totalRecords) * 100) 
                    : 0
            });

        } catch (error) {
            this.logger.error('Failed to save execution summary to Aurora PostgreSQL', {
                executionId: executionSummary.executionId,
                error: error instanceof Error ? error.message : String(error)
            });

            throw new DatabaseSaveError(
                `Failed to save execution summary to Aurora PostgreSQL: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * 処理結果の分析レポートを生成してS3に保存
     * @param aggregatedResult 集約結果
     * @param outputBucket 出力先S3バケット
     * @returns レポート保存場所情報
     */
    async generateAndSaveAnalysisReport(
        aggregatedResult: AggregatedResult,
        outputBucket: string
    ): Promise<{ s3Bucket: string; s3Key: string }> {
        try {
            // 分析レポートの生成
            const reportData = this.generateAnalysisReport(aggregatedResult);
            
            // S3キー生成
            const timestamp = new Date().toISOString().split('T')[0];
            const s3Key = `reports/${timestamp}/${aggregatedResult.executionId}/analysis-report.json`;

            // S3に保存
            const reportJson = JSON.stringify(reportData, null, 2);
            const command = new PutObjectCommand({
                Bucket: outputBucket,
                Key: s3Key,
                Body: reportJson,
                ContentType: 'application/json',
                Metadata: {
                    'execution-id': aggregatedResult.executionId,
                    'report-type': 'analysis-report',
                    'generated-at': new Date().toISOString()
                }
            });

            await this.s3Client.send(command);

            this.logger.info('Analysis report generated and saved successfully', {
                executionId: aggregatedResult.executionId,
                s3Bucket: outputBucket,
                s3Key
            });

            return { s3Bucket: outputBucket, s3Key };

        } catch (error) {
            this.logger.error('Failed to generate and save analysis report', {
                executionId: aggregatedResult.executionId,
                error: error instanceof Error ? error.message : String(error)
            });

            throw error;
        }
    }

    /**
     * 分析レポートデータの生成
     */
    private generateAnalysisReport(aggregatedResult: AggregatedResult): any {
        return {
            executionSummary: {
                executionId: aggregatedResult.executionId,
                mapRunId: aggregatedResult.mapRunId,
                processingDate: aggregatedResult.aggregationTimestamp.split('T')[0],
                status: aggregatedResult.errorRate > 10 ? 'FAILED' : 'SUCCEEDED'
            },
            performanceMetrics: {
                totalProcessed: aggregatedResult.totalProcessed,
                successCount: aggregatedResult.successCount,
                errorCount: aggregatedResult.errorCount,
                successRate: aggregatedResult.successRate,
                errorRate: aggregatedResult.errorRate,
                throughputRecordsPerSecond: aggregatedResult.throughputRecordsPerSecond,
                averageProcessingTimePerBatch: aggregatedResult.averageProcessingTimePerBatch
            },
            qualityAssessment: {
                dataQualityScore: Math.max(0, 100 - (aggregatedResult.errorRate * 2)),
                performanceScore: Math.min(100, aggregatedResult.throughputRecordsPerSecond * 2),
                overallScore: Math.max(0, 100 - aggregatedResult.errorRate - (aggregatedResult.averageProcessingTimePerBatch > 5000 ? 20 : 0))
            },
            errorAnalysis: {
                topErrorTypes: aggregatedResult.errorAnalysis.topErrors,
                criticalErrors: aggregatedResult.errorAnalysis.criticalErrors,
                retryableErrorCount: aggregatedResult.errorAnalysis.retryableErrors,
                nonRetryableErrorCount: aggregatedResult.errorAnalysis.nonRetryableErrors
            },
            recommendations: aggregatedResult.recommendations,
            generatedAt: new Date().toISOString(),
            reportVersion: '1.0'
        };
    }
}

/**
 * S3保存エラー
 */
export class S3SaveError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'S3SaveError';
    }
}

/**
 * データベース保存エラー
 */
export class DatabaseSaveError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DatabaseSaveError';
    }
}

/**
 * RdsUserRepositoryにcompleteProcessingExecutionメソッドを追加する拡張
 * 実際の実装では、RdsUserRepositoryクラスを直接拡張します
 */
declare module './RdsUserRepository' {
    interface RdsUserRepository {
        completeProcessingExecution(
            executionId: string,
            status: string,
            totalRecords: number,
            successRecords: number,
            errorRecords: number,
            executionOutput?: string,
            errorDetails?: string
        ): Promise<void>;
    }
}