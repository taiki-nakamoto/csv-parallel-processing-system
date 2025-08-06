import { z } from 'zod';

/**
 * 監査ログドメインモデル
 * システムの操作履歴・監査情報を管理
 */
export class AuditLog {
  public readonly executionId: string;
  public readonly timestamp: Date;
  public readonly eventType: string;
  public readonly logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  public readonly functionName: string;
  public readonly message: string;
  public readonly metadata?: Record<string, any>;
  public readonly ttl?: Date;

  constructor(props: {
    executionId: string;
    timestamp: Date;
    eventType: string;
    logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    functionName: string;
    message: string;
    metadata?: Record<string, any>;
    retentionDays?: number;
  }) {
    // バリデーション
    const schema = z.object({
      executionId: z.string().min(1, 'Execution ID is required'),
      timestamp: z.date(),
      eventType: z.string().min(1, 'Event type is required'),
      logLevel: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']),
      functionName: z.string().min(1, 'Function name is required'),
      message: z.string().min(1, 'Message is required'),
      metadata: z.record(z.any()).optional(),
      retentionDays: z.number().positive().optional()
    });

    const validated = schema.parse(props);

    this.executionId = validated.executionId;
    this.timestamp = validated.timestamp;
    this.eventType = validated.eventType;
    this.logLevel = validated.logLevel;
    this.functionName = validated.functionName;
    this.message = validated.message;
    this.metadata = validated.metadata;

    // TTL設定（デフォルト90日）
    if (validated.retentionDays) {
      const ttlDate = new Date(this.timestamp);
      ttlDate.setDate(ttlDate.getDate() + validated.retentionDays);
      this.ttl = ttlDate;
    }
  }

  /**
   * ログエントリをDynamoDB用のアイテムに変換
   */
  toDynamoDbItem(): Record<string, any> {
    const item: Record<string, any> = {
      execution_id: this.executionId,
      timestamp: this.timestamp.toISOString(),
      event_type: this.eventType,
      log_level: this.logLevel,
      function_name: this.functionName,
      message: this.message
    };

    if (this.metadata) {
      item.metadata = this.metadata;
    }

    if (this.ttl) {
      item.ttl = Math.floor(this.ttl.getTime() / 1000); // Unix timestamp
    }

    return item;
  }

  /**
   * CloudWatch Logs用のメッセージ形式に変換
   */
  toCloudWatchMessage(): string {
    const logData = {
      timestamp: this.timestamp.toISOString(),
      level: this.logLevel,
      executionId: this.executionId,
      eventType: this.eventType,
      functionName: this.functionName,
      message: this.message,
      metadata: this.metadata
    };

    return JSON.stringify(logData);
  }

  /**
   * エラーレベルかチェック
   */
  get isError(): boolean {
    return this.logLevel === 'ERROR';
  }

  /**
   * 警告レベル以上かチェック
   */
  get isWarningOrAbove(): boolean {
    return this.logLevel === 'WARN' || this.logLevel === 'ERROR';
  }

  /**
   * デバッグレベルかチェック
   */
  get isDebug(): boolean {
    return this.logLevel === 'DEBUG';
  }

  /**
   * ログのサマリー情報を取得
   */
  getSummary(): {
    executionId: string;
    eventType: string;
    logLevel: string;
    timestamp: string;
    message: string;
  } {
    return {
      executionId: this.executionId,
      eventType: this.eventType,
      logLevel: this.logLevel,
      timestamp: this.timestamp.toISOString(),
      message: this.message
    };
  }

  /**
   * DynamoDBアイテムから監査ログオブジェクトを復元
   */
  static fromDynamoDbItem(item: Record<string, any>): AuditLog {
    return new AuditLog({
      executionId: item.execution_id,
      timestamp: new Date(item.timestamp),
      eventType: item.event_type,
      logLevel: item.log_level,
      functionName: item.function_name,
      message: item.message,
      metadata: item.metadata
    });
  }
}