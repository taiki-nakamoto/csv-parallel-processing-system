import { Logger } from '@aws-lambda-powertools/logger';
import { MapResult, MapStatistics, ErrorAnalysis } from '../../controllers/ResultAggregationController';

/**
 * 結果集約ドメインサービス
 * ビジネスルールに基づく集約ロジック、エラー分析、推奨事項生成を担当
 */
export class ResultAggregator {
    private readonly logger = new Logger({ serviceName: 'ResultAggregator' });

    /**
     * エラー分析の実行
     * @param results 分散マップ結果配列
     * @returns エラー分析結果
     */
    async analyzeErrors(results: MapResult[]): Promise<ErrorAnalysis> {
        this.logger.debug('Starting error analysis', {
            totalResults: results.length
        });

        try {
            // エラーを含む結果のみ抽出
            const errorResults = results.filter(result => 
                result.status === 'FAILED' || result.errors.length > 0
            );

            // エラータイプ別集計
            const errorsByType: Record<string, number> = {};
            let retryableErrors = 0;
            let nonRetryableErrors = 0;
            const criticalErrors: string[] = [];

            // 全エラーを分析
            for (const result of errorResults) {
                for (const error of result.errors) {
                    const errorType = this.classifyErrorType(error);
                    errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;

                    // リトライ可否判定
                    if (this.isRetryableError(error)) {
                        retryableErrors++;
                    } else {
                        nonRetryableErrors++;
                    }

                    // 重大エラー判定
                    if (this.isCriticalError(error)) {
                        const criticalErrorMessage = `${errorType}: ${error.error || error.message || 'Unknown error'}`;
                        if (!criticalErrors.includes(criticalErrorMessage)) {
                            criticalErrors.push(criticalErrorMessage);
                        }
                    }
                }
            }

            // トップエラーの計算
            const totalErrors = Object.values(errorsByType).reduce((sum, count) => sum + count, 0);
            const topErrors = Object.entries(errorsByType)
                .map(([errorType, count]) => ({
                    errorType,
                    count,
                    percentage: totalErrors > 0 ? Math.round((count / totalErrors) * 100 * 100) / 100 : 0
                }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10); // トップ10エラー

            const errorAnalysis: ErrorAnalysis = {
                errorsByType,
                topErrors,
                retryableErrors,
                nonRetryableErrors,
                criticalErrors
            };

            this.logger.debug('Error analysis completed', {
                totalErrorTypes: Object.keys(errorsByType).length,
                retryableErrors,
                nonRetryableErrors,
                criticalErrorsCount: criticalErrors.length
            });

            return errorAnalysis;

        } catch (error) {
            this.logger.error('Error analysis failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            
            // フォールバック：空の分析結果を返す
            return {
                errorsByType: {},
                topErrors: [],
                retryableErrors: 0,
                nonRetryableErrors: 0,
                criticalErrors: []
            };
        }
    }

    /**
     * 推奨事項の生成
     * @param analysisData 分析用データ
     * @returns 推奨事項配列
     */
    async generateRecommendations(analysisData: {
        statistics: MapStatistics;
        results: MapResult[];
        errorAnalysis: ErrorAnalysis;
        performanceMetrics: any;
    }): Promise<string[]> {
        const recommendations: string[] = [];

        try {
            // エラー率に基づく推奨事項
            const errorRate = analysisData.statistics.totalItems > 0 
                ? (analysisData.statistics.failedItems / analysisData.statistics.totalItems) * 100 
                : 0;

            if (errorRate > 10) {
                recommendations.push(
                    '🔴 重大: エラー率が10%を超えています。データ品質の確認とエラー原因の調査が必要です。'
                );
            } else if (errorRate > 5) {
                recommendations.push(
                    '🟡 注意: エラー率が5%を超えています。処理ロジックの見直しを検討してください。'
                );
            }

            // 重大エラーに基づく推奨事項
            if (analysisData.errorAnalysis.criticalErrors.length > 0) {
                recommendations.push(
                    `🔴 重大: ${analysisData.errorAnalysis.criticalErrors.length}件の重大エラーが発生しました。緊急対応が必要です。`
                );
            }

            // パフォーマンスに基づく推奨事項
            const throughput = analysisData.performanceMetrics?.throughputRecordsPerSecond || 0;
            if (throughput < 10) {
                recommendations.push(
                    '⚡ パフォーマンス: 処理スループットが低下しています。並列度の調整やバッチサイズの最適化を検討してください。'
                );
            }

            // エラーパターンに基づく推奨事項
            if (analysisData.errorAnalysis.topErrors.length > 0) {
                const topError = analysisData.errorAnalysis.topErrors[0];
                if (topError.percentage > 50) {
                    recommendations.push(
                        `🔍 分析: ${topError.errorType}エラーが全エラーの${topError.percentage}%を占めています。このエラーパターンの優先対応を推奨します。`
                    );
                }
            }

            // リトライ可能エラーに基づく推奨事項
            if (analysisData.errorAnalysis.retryableErrors > analysisData.errorAnalysis.nonRetryableErrors * 2) {
                recommendations.push(
                    '🔄 運用: 一時的なエラーが多数発生しています。自動リトライ機能の有効化を検討してください。'
                );
            }

            // タイムアウト分析
            const timedOutItems = analysisData.statistics.timedOutItems;
            if (timedOutItems > 0) {
                const timeoutRate = (timedOutItems / analysisData.statistics.totalItems) * 100;
                if (timeoutRate > 5) {
                    recommendations.push(
                        '⏰ タイムアウト: タイムアウトが頻発しています。処理時間制限の見直しや処理の最適化が必要です。'
                    );
                }
            }

            // データ量に基づく推奨事項
            if (analysisData.statistics.totalItems > 10000) {
                recommendations.push(
                    '📊 スケーリング: 大量データ処理を行っています。パフォーマンス監視を継続し、必要に応じてリソースの増強を検討してください。'
                );
            }

            // 成功事例の推奨事項
            if (errorRate < 1 && throughput > 50) {
                recommendations.push(
                    '✅ 良好: 処理品質・パフォーマンスともに良好です。現在の設定を維持することを推奨します。'
                );
            }

            // 推奨事項が空の場合のフォールバック
            if (recommendations.length === 0) {
                recommendations.push(
                    '✅ 標準: 処理は正常に完了しました。継続的な監視を行ってください。'
                );
            }

            this.logger.debug('Recommendations generated', {
                recommendationCount: recommendations.length,
                errorRate,
                throughput
            });

            return recommendations;

        } catch (error) {
            this.logger.error('Recommendation generation failed', {
                error: error instanceof Error ? error.message : String(error)
            });

            // フォールバック推奨事項
            return ['⚠️ 推奨事項の生成中にエラーが発生しました。手動での分析を推奨します。'];
        }
    }

    /**
     * エラータイプの分類
     */
    private classifyErrorType(error: any): string {
        const errorMessage = error.error || error.message || '';
        const errorType = error.errorType || error.type || '';

        // ドメインエラーの分類
        if (errorType.includes('ValidationError') || errorMessage.includes('validation')) {
            return 'データバリデーションエラー';
        }
        
        if (errorType.includes('UserNotFound') || errorMessage.includes('not found')) {
            return 'データ不存在エラー';
        }
        
        if (errorType.includes('BusinessRuleViolation') || errorMessage.includes('business rule')) {
            return 'ビジネスルール違反エラー';
        }

        // インフラエラーの分類
        if (errorType.includes('Connection') || errorMessage.includes('connection')) {
            return 'データベース接続エラー';
        }
        
        if (errorType.includes('Timeout') || errorMessage.includes('timeout')) {
            return 'タイムアウトエラー';
        }
        
        if (errorType.includes('Throttling') || errorMessage.includes('throttled')) {
            return 'スロットリングエラー';
        }

        // システムエラーの分類
        if (errorType.includes('Memory') || errorMessage.includes('memory')) {
            return 'メモリ不足エラー';
        }
        
        if (errorType.includes('Permission') || errorMessage.includes('access denied')) {
            return '権限エラー';
        }

        // デフォルト分類
        return errorType || 'その他のエラー';
    }

    /**
     * エラーのリトライ可否判定
     */
    private isRetryableError(error: any): boolean {
        const errorType = error.errorType || error.type || '';
        const errorMessage = error.error || error.message || '';

        // リトライ不可のエラー
        const nonRetryablePatterns = [
            'ValidationError',
            'UserNotFound',
            'BusinessRuleViolation',
            'Permission',
            'validation',
            'not found',
            'business rule',
            'access denied'
        ];

        for (const pattern of nonRetryablePatterns) {
            if (errorType.includes(pattern) || errorMessage.includes(pattern)) {
                return false;
            }
        }

        // リトライ可能なエラー（一時的なエラー）
        const retryablePatterns = [
            'Connection',
            'Timeout',
            'Throttling',
            'ServiceUnavailable',
            'InternalServerError',
            'connection',
            'timeout',
            'throttled',
            'service unavailable',
            'internal server error'
        ];

        for (const pattern of retryablePatterns) {
            if (errorType.includes(pattern) || errorMessage.includes(pattern)) {
                return true;
            }
        }

        // デフォルトはリトライ可能とみなす
        return true;
    }

    /**
     * 重大エラーの判定
     */
    private isCriticalError(error: any): boolean {
        const errorType = error.errorType || error.type || '';
        const errorMessage = error.error || error.message || '';

        // 重大エラーパターン
        const criticalPatterns = [
            'DatabaseConnection',
            'DataCorruption',
            'SecurityViolation',
            'SystemFailure',
            'OutOfMemory',
            'data corruption',
            'security violation',
            'system failure',
            'out of memory'
        ];

        for (const pattern of criticalPatterns) {
            if (errorType.includes(pattern) || errorMessage.includes(pattern)) {
                return true;
            }
        }

        // 高頻度エラーも重大とみなす
        return false;
    }
}