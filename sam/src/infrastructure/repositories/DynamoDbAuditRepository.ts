import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { AuditLog } from '@domain/models/AuditLog';
import { IAuditLogRepository } from '@domain/interfaces/IAuditLogRepository';

const logger = new Logger({ serviceName: 'dynamodb-audit-repository' });

/**
 * DynamoDB監査ログリポジトリ（インフラストラクチャ層）
 * IAuditLogRepositoryインターフェースの実装
 */
export class DynamoDbAuditRepository implements IAuditLogRepository {
  private dynamoClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor() {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || 'ap-northeast-1'
    });
    
    this.dynamoClient = DynamoDBDocumentClient.from(client);
    this.tableName = process.env.DYNAMODB_AUDIT_TABLE || 'csv-parallel-processing-audit-logs-dev';
  }

  /**
   * 監査ログを保存
   * @param auditLog 監査ログオブジェクト
   */
  async saveAuditLog(auditLog: AuditLog): Promise<void> {
    logger.info('Saving audit log to DynamoDB', {
      executionId: auditLog.executionId,
      eventType: auditLog.eventType,
      tableName: this.tableName
    });

    try {
      const item = auditLog.toDynamoDbItem();
      
      const command = new PutCommand({
        TableName: this.tableName,
        Item: item
      });

      await this.dynamoClient.send(command);
      
      logger.info('Successfully saved audit log', {
        executionId: auditLog.executionId,
        eventType: auditLog.eventType
      });

    } catch (error) {
      logger.error('Failed to save audit log to DynamoDB', {
        executionId: auditLog.executionId,
        eventType: auditLog.eventType,
        tableName: this.tableName,
        error
      });
      throw error;
    }
  }

  /**
   * 実行IDで監査ログを取得
   * @param executionId 実行ID
   * @returns 監査ログ配列
   */
  async getAuditLogsByExecutionId(executionId: string): Promise<AuditLog[]> {
    logger.info('Getting audit logs by execution ID', { executionId, tableName: this.tableName });

    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'execution_id = :executionId',
        ExpressionAttributeValues: {
          ':executionId': executionId
        },
        ScanIndexForward: true // timestampで昇順ソート
      });

      const response = await this.dynamoClient.send(command);
      const items = response.Items || [];
      
      const auditLogs = items.map(item => AuditLog.fromDynamoDbItem(item));
      
      logger.info('Successfully retrieved audit logs', {
        executionId,
        logCount: auditLogs.length
      });

      return auditLogs;

    } catch (error) {
      logger.error('Failed to get audit logs by execution ID', {
        executionId,
        tableName: this.tableName,
        error
      });
      throw error;
    }
  }

  /**
   * イベントタイプで監査ログを検索
   * @param eventType イベントタイプ
   * @param startTime 開始時間（オプション）
   * @param endTime 終了時間（オプション）
   * @param limit 取得件数制限（デフォルト100）
   * @returns 監査ログ配列
   */
  async getAuditLogsByEventType(
    eventType: string,
    startTime?: Date,
    endTime?: Date,
    limit: number = 100
  ): Promise<AuditLog[]> {
    logger.info('Getting audit logs by event type', {
      eventType,
      startTime,
      endTime,
      limit,
      tableName: this.tableName
    });

    try {
      let keyConditionExpression = 'event_type = :eventType';
      const expressionAttributeValues: Record<string, any> = {
        ':eventType': eventType
      };

      // 時間範囲指定がある場合
      if (startTime && endTime) {
        keyConditionExpression += ' AND timestamp BETWEEN :startTime AND :endTime';
        expressionAttributeValues[':startTime'] = startTime.toISOString();
        expressionAttributeValues[':endTime'] = endTime.toISOString();
      } else if (startTime) {
        keyConditionExpression += ' AND timestamp >= :startTime';
        expressionAttributeValues[':startTime'] = startTime.toISOString();
      } else if (endTime) {
        keyConditionExpression += ' AND timestamp <= :endTime';
        expressionAttributeValues[':endTime'] = endTime.toISOString();
      }

      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'EventTypeIndex', // GSI
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: limit,
        ScanIndexForward: false // 新しい順
      });

      const response = await this.dynamoClient.send(command);
      const items = response.Items || [];
      
      const auditLogs = items.map(item => AuditLog.fromDynamoDbItem(item));
      
      logger.info('Successfully retrieved audit logs by event type', {
        eventType,
        logCount: auditLogs.length
      });

      return auditLogs;

    } catch (error) {
      logger.error('Failed to get audit logs by event type', {
        eventType,
        tableName: this.tableName,
        error
      });
      throw error;
    }
  }

  /**
   * ログレベルで監査ログを検索
   * @param logLevel ログレベル
   * @param startTime 開始時間（オプション）
   * @param endTime 終了時間（オプション）
   * @param limit 取得件数制限（デフォルト100）
   * @returns 監査ログ配列
   */
  async getAuditLogsByLogLevel(
    logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
    startTime?: Date,
    endTime?: Date,
    limit: number = 100
  ): Promise<AuditLog[]> {
    logger.info('Getting audit logs by log level', {
      logLevel,
      startTime,
      endTime,
      limit,
      tableName: this.tableName
    });

    try {
      let keyConditionExpression = 'log_level = :logLevel';
      const expressionAttributeValues: Record<string, any> = {
        ':logLevel': logLevel
      };

      // 時間範囲指定がある場合
      if (startTime && endTime) {
        keyConditionExpression += ' AND timestamp BETWEEN :startTime AND :endTime';
        expressionAttributeValues[':startTime'] = startTime.toISOString();
        expressionAttributeValues[':endTime'] = endTime.toISOString();
      }

      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'LogLevelIndex', // GSI
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: limit,
        ScanIndexForward: false // 新しい順
      });

      const response = await this.dynamoClient.send(command);
      const items = response.Items || [];
      
      const auditLogs = items.map(item => AuditLog.fromDynamoDbItem(item));
      
      logger.info('Successfully retrieved audit logs by log level', {
        logLevel,
        logCount: auditLogs.length
      });

      return auditLogs;

    } catch (error) {
      logger.error('Failed to get audit logs by log level', {
        logLevel,
        tableName: this.tableName,
        error
      });
      throw error;
    }
  }

  /**
   * 複数の監査ログを一括保存
   * @param auditLogs 監査ログオブジェクト配列
   */
  async batchSaveAuditLogs(auditLogs: AuditLog[]): Promise<void> {
    logger.info('Batch saving audit logs to DynamoDB', {
      logCount: auditLogs.length,
      tableName: this.tableName
    });

    try {
      // DynamoDBのBatchWriteは最大25アイテムまでなので分割処理
      const batchSize = 25;
      const batches = [];
      
      for (let i = 0; i < auditLogs.length; i += batchSize) {
        batches.push(auditLogs.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        const putRequests = batch.map(auditLog => ({
          PutRequest: {
            Item: auditLog.toDynamoDbItem()
          }
        }));

        const command = new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: putRequests
          }
        });

        await this.dynamoClient.send(command);
      }
      
      logger.info('Successfully batch saved audit logs', {
        logCount: auditLogs.length
      });

    } catch (error) {
      logger.error('Failed to batch save audit logs to DynamoDB', {
        logCount: auditLogs.length,
        tableName: this.tableName,
        error
      });
      throw error;
    }
  }

  /**
   * エラーログのみを取得
   * @param startTime 開始時間
   * @param endTime 終了時間
   * @param limit 取得件数制限（デフォルト100）
   * @returns エラーログ配列
   */
  async getErrorLogs(startTime: Date, endTime: Date, limit: number = 100): Promise<AuditLog[]> {
    return await this.getAuditLogsByLogLevel('ERROR', startTime, endTime, limit);
  }

  /**
   * 監査ログの統計情報を取得
   * @param startTime 開始時間
   * @param endTime 終了時間
   * @returns 統計情報
   */
  async getAuditLogStatistics(startTime: Date, endTime: Date): Promise<{
    totalLogs: number;
    logsByLevel: Record<string, number>;
    logsByEventType: Record<string, number>;
  }> {
    // 実装の簡素化のため、基本的な統計のみ提供
    // 本格的な統計はCloudWatch InsightsやElasticsearchを使用することを推奨
    
    logger.info('Getting audit log statistics', { startTime, endTime });
    
    // 簡易実装：各ログレベルのカウント
    const errorLogs = await this.getAuditLogsByLogLevel('ERROR', startTime, endTime, 1000);
    const warnLogs = await this.getAuditLogsByLogLevel('WARN', startTime, endTime, 1000);
    const infoLogs = await this.getAuditLogsByLogLevel('INFO', startTime, endTime, 1000);
    const debugLogs = await this.getAuditLogsByLogLevel('DEBUG', startTime, endTime, 1000);
    
    const totalLogs = errorLogs.length + warnLogs.length + infoLogs.length + debugLogs.length;
    
    // イベントタイプ別の集計（簡易実装）
    const allLogs = [...errorLogs, ...warnLogs, ...infoLogs, ...debugLogs];
    const logsByEventType: Record<string, number> = {};
    
    allLogs.forEach(log => {
      logsByEventType[log.eventType] = (logsByEventType[log.eventType] || 0) + 1;
    });
    
    return {
      totalLogs,
      logsByLevel: {
        ERROR: errorLogs.length,
        WARN: warnLogs.length,
        INFO: infoLogs.length,
        DEBUG: debugLogs.length
      },
      logsByEventType
    };
  }

  /**
   * 古い監査ログを削除（TTL切れ）
   * @param cutoffDate 削除対象日付
   * @returns 削除件数
   */
  async deleteExpiredAuditLogs(cutoffDate: Date): Promise<number> {
    logger.info('Deleting expired audit logs', { cutoffDate, tableName: this.tableName });

    try {
      // DynamoDBではTTLを使用して自動削除することを推奨
      // 手動削除の場合はScanとBatchDeleteが必要だが、コストが高い
      // このため、実装では警告を出力し、TTL設定を推奨する
      logger.warn('Manual deletion of expired audit logs is not implemented. Please use DynamoDB TTL feature instead.', {
        cutoffDate,
        recommendation: 'Configure TTL on the timestamp field in DynamoDB table'
      });

      return 0; // TTL使用を前提として0を返す

    } catch (error) {
      logger.error('Failed to delete expired audit logs', {
        cutoffDate,
        tableName: this.tableName,
        error
      });
      throw error;
    }
  }
}