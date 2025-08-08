/**
 * Business Logic Layer - Entry Point
 * ビジネスロジックLayer共通エントリーポイント
 */
export { CsvProcessingLogic } from './CsvProcessingLogic';
export { 
    ValidationLogic, 
    type CsvDataType,
    type CsvColumnSchema,
    type CsvRowSchema,
    type ValidationError,
    type ValidationWarning,
    type CsvRowValidationResult
} from './ValidationLogic';
export { 
    DataTransformationLogic,
    type TransformationRule,
    type DataTransformationRules,
    type TransformationLogEntry,
    type DataAggregation,
    type PivotConfiguration
} from './DataTransformationLogic';

// 便利なヘルパー関数
export class BusinessLogicHelper {
    
    /**
     * 全レイヤーの機能を統合したCSV処理パイプライン
     * @param csvData CSV行データ
     * @param config パイプライン設定
     * @returns 処理結果
     */
    static async processCsvPipeline(
        csvData: string[][],
        config: CsvPipelineConfig
    ): Promise<CsvPipelineResult> {
        const startTime = Date.now();
        const results: CsvPipelineResult = {
            processedData: csvData,
            originalRowCount: csvData.length,
            finalRowCount: 0,
            validationResults: null,
            transformationResults: null,
            aggregationResults: null,
            processingTime: 0,
            success: true,
            errors: []
        };

        try {
            // 1. データ前処理（クリーニング）
            if (config.enablePreprocessing) {
                const preprocessResult = CsvProcessingLogic.preprocessCsvData(results.processedData);
                results.processedData = preprocessResult.cleanedData;
            }

            // 2. バリデーション
            if (config.validationSchema) {
                const validationResults: any[] = [];
                
                for (let i = 0; i < results.processedData.length; i++) {
                    const rowResult = ValidationLogic.validateCsvRow(
                        results.processedData[i],
                        config.validationSchema,
                        i
                    );
                    validationResults.push(rowResult);
                }
                
                results.validationResults = ValidationLogic.mergeValidationResults(validationResults);
                
                // バリデーションエラーがある場合の処理
                if (config.stopOnValidationError && !results.validationResults.overallValid) {
                    results.success = false;
                    results.errors.push(`Validation failed: ${results.validationResults.totalErrors} errors found`);
                    return results;
                }
            }

            // 3. データ変換
            if (config.transformationRules) {
                const transformResult = DataTransformationLogic.standardizeData(
                    results.processedData,
                    config.transformationRules
                );
                results.processedData = transformResult.transformedData;
                results.transformationResults = transformResult.statistics;
            }

            // 4. データ集約
            if (config.aggregationConfig) {
                const aggregateResult = DataTransformationLogic.aggregateData(
                    results.processedData,
                    config.aggregationConfig.groupByColumns,
                    config.aggregationConfig.aggregations
                );
                results.processedData = aggregateResult.aggregatedData;
                results.aggregationResults = aggregateResult.metadata;
            }

            // 5. 品質スコア計算
            if (config.enableQualityAssessment) {
                const qualityScore = CsvProcessingLogic.calculateDataQualityScore(
                    results.processedData,
                    config.requiredColumns || [],
                    config.numericColumns || []
                );
                results.qualityScore = qualityScore;
            }

            results.finalRowCount = results.processedData.length;
            results.processingTime = Date.now() - startTime;

        } catch (error) {
            results.success = false;
            results.errors.push(error instanceof Error ? error.message : String(error));
            results.processingTime = Date.now() - startTime;
        }

        return results;
    }

    /**
     * 統計情報の生成
     * @param csvData CSVデータ
     * @returns 統計情報
     */
    static generateStatistics(csvData: string[][]): CsvStatistics {
        const stats = CsvProcessingLogic.calculateStatistics(csvData);
        const duplicateCheck = CsvProcessingLogic.checkDuplicates(csvData, []);
        
        return {
            rowCount: stats.rowCount,
            columnCount: stats.columnCount,
            numericStats: stats.numericStats,
            textStats: stats.textStats,
            duplicateInfo: {
                hasDuplicates: duplicateCheck.hasDuplicates,
                duplicateCount: duplicateCheck.duplicateCount,
                uniqueCount: duplicateCheck.uniqueCount
            },
            generatedAt: new Date()
        };
    }

    /**
     * 推奨チャンクサイズの計算
     * @param totalRows 総行数
     * @param availableMemory 利用可能メモリ（MB）
     * @param targetMemoryUsage 目標メモリ使用率（%）
     * @returns 推奨チャンクサイズ
     */
    static calculateOptimalChunkSize(
        totalRows: number,
        availableMemory: number = 512,
        targetMemoryUsage: number = 70
    ): number {
        const targetMemoryMB = availableMemory * (targetMemoryUsage / 100);
        const estimatedRowSizeKB = 2; // 1行あたりの推定サイズ（KB）
        const maxRowsInMemory = Math.floor((targetMemoryMB * 1024) / estimatedRowSizeKB);
        
        // 最小25行、最大1000行の範囲で調整
        const chunkSize = Math.max(25, Math.min(1000, Math.floor(maxRowsInMemory / 2)));
        
        return chunkSize;
    }

    /**
     * エラーレポートの生成
     * @param validationResults バリデーション結果
     * @returns エラーレポート
     */
    static generateErrorReport(validationResults: any): ErrorReport {
        const report: ErrorReport = {
            totalErrors: validationResults.totalErrors,
            totalWarnings: validationResults.totalWarnings,
            errorsByType: validationResults.errorsByType,
            warningsByType: validationResults.warningsByType,
            validationRate: validationResults.validationRate,
            recommendations: [],
            generatedAt: new Date()
        };

        // 推奨事項生成
        if (report.totalErrors > 0) {
            report.recommendations.push('Review and fix validation errors before processing');
        }
        if (report.validationRate < 90) {
            report.recommendations.push('Consider improving data quality');
        }
        
        const topErrorTypes = Object.entries(report.errorsByType)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3);
        
        topErrorTypes.forEach(([errorType, count]) => {
            report.recommendations.push(`Address ${errorType} errors (${count} occurrences)`);
        });

        return report;
    }
}

// 型定義
export interface CsvPipelineConfig {
    enablePreprocessing?: boolean;
    validationSchema?: any;
    transformationRules?: any;
    aggregationConfig?: {
        groupByColumns: number[];
        aggregations: any[];
    };
    stopOnValidationError?: boolean;
    enableQualityAssessment?: boolean;
    requiredColumns?: number[];
    numericColumns?: number[];
}

export interface CsvPipelineResult {
    processedData: string[][];
    originalRowCount: number;
    finalRowCount: number;
    validationResults: any;
    transformationResults: any;
    aggregationResults: any;
    qualityScore?: any;
    processingTime: number;
    success: boolean;
    errors: string[];
}

export interface CsvStatistics {
    rowCount: number;
    columnCount: number;
    numericStats: Record<number, any>;
    textStats: Record<number, any>;
    duplicateInfo: {
        hasDuplicates: boolean;
        duplicateCount: number;
        uniqueCount: number;
    };
    generatedAt: Date;
}

export interface ErrorReport {
    totalErrors: number;
    totalWarnings: number;
    errorsByType: Record<string, number>;
    warningsByType: Record<string, number>;
    validationRate: number;
    recommendations: string[];
    generatedAt: Date;
}