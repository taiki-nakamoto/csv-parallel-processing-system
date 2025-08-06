import { z } from 'zod';

/**
 * 処理メタデータドメインモデル（設計書準拠版）
 * CSV処理の実行状況と進捗を管理
 * 設計書準拠: 03-12_詳細設計書_監視・ログ詳細設計.md
 */
export class ProcessingMetadata {
  public readonly executionId: string;
  public readonly functionName: string;
  public readonly eventType: string;
  public readonly status: ProcessingStatus;
  public readonly metadata: Record<string, any>;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly ttl?: Date;

  constructor(
    executionId: string,
    functionName: string,
    eventType: string,
    status: ProcessingStatus,
    metadata: Record<string, any> = {},
    ttlDays?: number
  ) {
    // バリデーション
    const schema = z.object({
      executionId: z.string().min(1, 'Execution ID is required'),
      functionName: z.string().min(1, 'Function name is required'),
      eventType: z.string().min(1, 'Event type is required'),
      status: z.nativeEnum(ProcessingStatus),
      metadata: z.record(z.any()),
      ttlDays: z.number().positive().optional()
    });

    const validated = schema.parse({
      executionId,
      functionName,
      eventType,
      status,
      metadata,
      ttlDays
    });

    this.executionId = validated.executionId;
    this.functionName = validated.functionName;
    this.eventType = validated.eventType;
    this.status = validated.status;
    this.metadata = validated.metadata;
    this.createdAt = new Date();
    this.updatedAt = new Date();

    // TTL設定（デフォルト30日）
    if (validated.ttlDays) {
      const ttlDate = new Date();
      ttlDate.setDate(ttlDate.getDate() + validated.ttlDays);
      this.ttl = ttlDate;
    }
  }

  /**
   * ファクトリーメソッド: 新規処理開始時のメタデータ作成
   * @param executionId 実行ID
   * @param functionName Lambda関数名
   * @param eventType イベントタイプ
   * @param initialMetadata 初期メタデータ
   * @returns ProcessingMetadata instance
   */
  static createNew(
    executionId: string,
    functionName: string,
    eventType: string,
    initialMetadata: Record<string, any> = {}
  ): ProcessingMetadata {
    const metadata = {
      ...initialMetadata,
      createdTimestamp: new Date().toISOString(),
      processingStarted: new Date().toISOString(),
      resourceUsage: {
        memoryUsed: 0,
        durationMs: 0
      },
      performanceMetrics: {
        recordsProcessed: 0,
        successCount: 0,
        errorCount: 0,
        throughput: 0
      },
      logStatistics: {
        totalLogs: 0,
        debugLogs: 0,
        infoLogs: 0,
        warnLogs: 0,
        errorLogs: 0
      }
    };

    return new ProcessingMetadata(
      executionId,
      functionName,
      eventType,
      ProcessingStatus.IN_PROGRESS,
      metadata,
      30 // 30日間保持
    );
  }

  /**
   * ファクトリーメソッド: チャンク処理用メタデータ作成
   * @param executionId 実行ID
   * @param chunkIndex チャンクインデックス
   * @param chunkSize チャンクサイズ
   * @param batchId バッチID
   * @returns ProcessingMetadata instance
   */
  static createForChunkProcessing(
    executionId: string,
    chunkIndex: number,
    chunkSize: number,
    batchId: string
  ): ProcessingMetadata {
    const metadata = {
      chunkProcessing: {
        chunkIndex,
        chunkSize,
        batchId,
        workersUsed: 5, // 5並列処理
        batchSize: 25,  // 25レコード/バッチ
        startedAt: new Date().toISOString()
      },
      performanceMetrics: {
        recordsProcessed: 0,
        successCount: 0,
        errorCount: 0,
        throughput: 0,
        processingTimeMs: 0
      }
    };

    return new ProcessingMetadata(
      executionId,
      'csv-processor',
      'CSV_CHUNK_PROCESSING',
      ProcessingStatus.IN_PROGRESS,
      metadata,
      30
    );
  }

  /**
   * ファクトリーメソッド: 結果集約用メタデータ作成
   * @param executionId 実行ID
   * @param mapRunId 分散マップ実行ID
   * @param totalItems 総アイテム数
   * @returns ProcessingMetadata instance
   */
  static createForResultAggregation(
    executionId: string,
    mapRunId: string,
    totalItems: number
  ): ProcessingMetadata {
    const metadata = {
      resultAggregation: {
        mapRunId,
        totalItems,
        aggregationStarted: new Date().toISOString(),
        outputGenerated: false
      },
      aggregationMetrics: {
        totalProcessed: 0,
        successCount: 0,
        errorCount: 0,
        successRate: 0,
        errorRate: 0
      }
    };

    return new ProcessingMetadata(
      executionId,
      'csv-processor',
      'RESULT_AGGREGATION',
      ProcessingStatus.IN_PROGRESS,
      metadata,
      30
    );
  }

  /**
   * 進捗情報の更新
   * @param progressUpdate 進捗更新情報
   * @returns 更新されたProcessingMetadata
   */
  updateProgress(progressUpdate: {
    recordsProcessed?: number;
    successCount?: number;
    errorCount?: number;
    memoryUsed?: number;
    processingTimeMs?: number;
    additionalMetadata?: Record<string, any>;
  }): ProcessingMetadata {
    const currentMetrics = this.metadata.performanceMetrics || {};
    const currentResourceUsage = this.metadata.resourceUsage || {};

    const updatedMetadata = {
      ...this.metadata,
      performanceMetrics: {
        ...currentMetrics,
        recordsProcessed: progressUpdate.recordsProcessed || currentMetrics.recordsProcessed || 0,
        successCount: progressUpdate.successCount || currentMetrics.successCount || 0,
        errorCount: progressUpdate.errorCount || currentMetrics.errorCount || 0,
        throughput: this.calculateThroughput(
          progressUpdate.recordsProcessed || currentMetrics.recordsProcessed || 0,
          progressUpdate.processingTimeMs || currentResourceUsage.durationMs || 1
        ),
        lastUpdated: new Date().toISOString()
      },
      resourceUsage: {
        ...currentResourceUsage,
        memoryUsed: Math.max(currentResourceUsage.memoryUsed || 0, progressUpdate.memoryUsed || 0),
        durationMs: progressUpdate.processingTimeMs || currentResourceUsage.durationMs || 0,
        lastUpdated: new Date().toISOString()
      },
      ...progressUpdate.additionalMetadata
    };

    return new ProcessingMetadata(
      this.executionId,
      this.functionName,
      this.eventType,
      this.status,
      updatedMetadata,
      this.getTtlDays()
    );
  }

  /**
   * 処理完了状態に更新
   * @param completionData 完了データ
   * @returns 完了状態のProcessingMetadata
   */
  complete(completionData: {
    finalRecordsProcessed: number;
    finalSuccessCount: number;
    finalErrorCount: number;
    totalProcessingTimeMs: number;
    outputLocation?: string;
    summaryData?: Record<string, any>;
  }): ProcessingMetadata {
    const completionMetadata = {
      ...this.metadata,
      processingCompleted: new Date().toISOString(),
      finalMetrics: {
        totalRecordsProcessed: completionData.finalRecordsProcessed,
        totalSuccessCount: completionData.finalSuccessCount,
        totalErrorCount: completionData.finalErrorCount,
        overallSuccessRate: this.calculateSuccessRate(
          completionData.finalSuccessCount,
          completionData.finalRecordsProcessed
        ),
        totalProcessingTimeMs: completionData.totalProcessingTimeMs,
        averageThroughput: this.calculateThroughput(
          completionData.finalRecordsProcessed,
          completionData.totalProcessingTimeMs
        )
      },
      outputLocation: completionData.outputLocation,
      summaryData: completionData.summaryData
    };

    return new ProcessingMetadata(
      this.executionId,
      this.functionName,
      this.eventType,
      ProcessingStatus.COMPLETED,
      completionMetadata,
      this.getTtlDays()
    );
  }

  /**
   * エラー状態に更新
   * @param errorData エラーデータ
   * @returns エラー状態のProcessingMetadata
   */
  fail(errorData: {
    errorMessage: string;
    errorType: string;
    errorStack?: string;
    partialResults?: Record<string, any>;
  }): ProcessingMetadata {
    const errorMetadata = {
      ...this.metadata,
      processingFailed: new Date().toISOString(),
      errorDetails: {
        errorMessage: errorData.errorMessage,
        errorType: errorData.errorType,
        errorStack: errorData.errorStack,
        errorOccurredAt: new Date().toISOString()
      },
      partialResults: errorData.partialResults
    };

    return new ProcessingMetadata(
      this.executionId,
      this.functionName,
      this.eventType,
      ProcessingStatus.FAILED,
      errorMetadata,
      this.getTtlDays()
    );
  }

  /**
   * ログ統計の更新
   * @param logLevel ログレベル
   * @param eventType ログイベントタイプ
   * @returns 更新されたProcessingMetadata
   */
  updateLogStatistics(logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', eventType: string): ProcessingMetadata {
    const currentLogStats = this.metadata.logStatistics || {
      totalLogs: 0,
      debugLogs: 0,
      infoLogs: 0,
      warnLogs: 0,
      errorLogs: 0
    };

    const updatedLogStats = {
      ...currentLogStats,
      totalLogs: currentLogStats.totalLogs + 1,
      debugLogs: currentLogStats.debugLogs + (logLevel === 'DEBUG' ? 1 : 0),
      infoLogs: currentLogStats.infoLogs + (logLevel === 'INFO' ? 1 : 0),
      warnLogs: currentLogStats.warnLogs + (logLevel === 'WARN' ? 1 : 0),
      errorLogs: currentLogStats.errorLogs + (logLevel === 'ERROR' ? 1 : 0),
      lastLogRecorded: new Date().toISOString(),
      lastLogLevel: logLevel,
      lastLogEventType: eventType
    };

    const updatedMetadata = {
      ...this.metadata,
      logStatistics: updatedLogStats
    };

    return new ProcessingMetadata(
      this.executionId,
      this.functionName,
      this.eventType,
      this.status,
      updatedMetadata,
      this.getTtlDays()
    );
  }

  /**
   * DynamoDB用のアイテム形式に変換
   */
  toDynamoDbItem(): Record<string, any> {
    const item: Record<string, any> = {
      execution_id: this.executionId,
      function_name: this.functionName,
      event_type: this.eventType,
      status: this.status,
      metadata: this.metadata,
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString()
    };

    if (this.ttl) {
      item.ttl = Math.floor(this.ttl.getTime() / 1000); // Unix timestamp
    }

    return item;
  }

  /**
   * API用のレスポンス形式に変換
   */
  toApiResponse(): Record<string, any> {
    const performanceMetrics = this.metadata.performanceMetrics || {};
    const resourceUsage = this.metadata.resourceUsage || {};
    const logStatistics = this.metadata.logStatistics || {};

    return {
      executionId: this.executionId,
      functionName: this.functionName,
      eventType: this.eventType,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      performance: {
        recordsProcessed: performanceMetrics.recordsProcessed || 0,
        successCount: performanceMetrics.successCount || 0,
        errorCount: performanceMetrics.errorCount || 0,
        throughput: performanceMetrics.throughput || 0
      },
      resources: {
        memoryUsed: resourceUsage.memoryUsed || 0,
        processingTimeMs: resourceUsage.durationMs || 0
      },
      logs: {
        totalLogs: logStatistics.totalLogs || 0,
        errorLogs: logStatistics.errorLogs || 0,
        warnLogs: logStatistics.warnLogs || 0
      },
      additionalMetadata: this.getFilteredMetadata()
    };
  }

  /**
   * 検索・フィルタリング用のサマリー情報
   */
  getSummary(): {
    executionId: string;
    functionName: string;
    eventType: string;
    status: string;
    createdAt: string;
    recordsProcessed: number;
    successRate: number;
    errorCount: number;
  } {
    const performanceMetrics = this.metadata.performanceMetrics || {};
    const finalMetrics = this.metadata.finalMetrics || {};

    const recordsProcessed = finalMetrics.totalRecordsProcessed || performanceMetrics.recordsProcessed || 0;
    const successCount = finalMetrics.totalSuccessCount || performanceMetrics.successCount || 0;
    const errorCount = finalMetrics.totalErrorCount || performanceMetrics.errorCount || 0;

    return {
      executionId: this.executionId,
      functionName: this.functionName,
      eventType: this.eventType,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
      recordsProcessed,
      successRate: this.calculateSuccessRate(successCount, recordsProcessed),
      errorCount
    };
  }

  /**
   * ステータスチェック: 処理中かどうか
   */
  get isInProgress(): boolean {
    return this.status === ProcessingStatus.IN_PROGRESS;
  }

  /**
   * ステータスチェック: 完了かどうか
   */
  get isCompleted(): boolean {
    return this.status === ProcessingStatus.COMPLETED;
  }

  /**
   * ステータスチェック: 失敗かどうか
   */
  get isFailed(): boolean {
    return this.status === ProcessingStatus.FAILED;
  }

  /**
   * 処理時間の取得（秒）
   */
  getProcessingDurationSeconds(): number {
    const resourceUsage = this.metadata.resourceUsage || {};
    const durationMs = resourceUsage.durationMs || 0;
    return Math.round(durationMs / 1000);
  }

  /**
   * スループット計算
   */
  private calculateThroughput(recordsProcessed: number, processingTimeMs: number): number {
    if (processingTimeMs <= 0) return 0;
    return Math.round((recordsProcessed / processingTimeMs) * 1000); // records/second
  }

  /**
   * 成功率計算
   */
  private calculateSuccessRate(successCount: number, totalProcessed: number): number {
    if (totalProcessed <= 0) return 0;
    return Math.round((successCount / totalProcessed) * 100);
  }

  /**
   * TTL日数の取得
   */
  private getTtlDays(): number | undefined {
    if (!this.ttl) return undefined;
    const diffMs = this.ttl.getTime() - this.createdAt.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * 機密情報を除いたメタデータの取得
   */
  private getFilteredMetadata(): Record<string, any> {
    const filtered = { ...this.metadata };
    // 機密情報やシステム内部データを除外
    delete filtered.internalSystemData;
    delete filtered.sensitiveData;
    return filtered;
  }

  /**
   * DynamoDBアイテムからProcessingMetadataを復元
   */
  static fromDynamoDbItem(item: Record<string, any>): ProcessingMetadata {
    const instance = Object.create(ProcessingMetadata.prototype);
    instance.executionId = item.execution_id;
    instance.functionName = item.function_name;
    instance.eventType = item.event_type;
    instance.status = item.status as ProcessingStatus;
    instance.metadata = item.metadata || {};
    instance.createdAt = new Date(item.created_at);
    instance.updatedAt = new Date(item.updated_at);
    
    if (item.ttl) {
      instance.ttl = new Date(item.ttl * 1000); // Unix timestamp to Date
    }

    return instance;
  }
}

/**
 * 処理ステータス列挙型
 */
export enum ProcessingStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED', 
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMEOUT = 'TIMEOUT'
}