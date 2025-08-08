import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand, QueryCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { ProcessingMetadata } from '@domain/models/ProcessingMetadata';
import { IProcessingMetadataRepository } from '@domain/interfaces/IProcessingMetadataRepository';
import { DynamoDbSanitizer } from '@utils/DynamoDbSanitizer';

const logger = new Logger({ serviceName: 'dynamodb-processing-metadata-repository' });

/**
 * DynamoDB処理メタデータリポジトリ（インフラストラクチャ層）
 * IProcessingMetadataRepositoryインターフェースの実装
 */
export class DynamoDbProcessingMetadataRepository implements IProcessingMetadataRepository {
  private dynamoClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor() {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || 'ap-northeast-1'
    });
    
    this.dynamoClient = DynamoDBDocumentClient.from(client);
    this.tableName = process.env.DYNAMODB_PROCESSING_METADATA_TABLE || 'csv-parallel-processing-metadata-dev';
  }

  /**
   * 処理メタデータを保存
   * @param metadata 処理メタデータオブジェクト
   */
  async save(metadata: ProcessingMetadata): Promise<void> {
    logger.info('Saving processing metadata to DynamoDB', {
      processingId: metadata.processingId,
      tableName: this.tableName
    });

    try {
      const item = metadata.toDynamoDbItem();
      
      // DynamoDBマーシャリングエラー防止のため、Date型オブジェクトをサニタイズ
      const sanitizedItem = DynamoDbSanitizer.sanitizeProcessingMetadata(item);
      
      logger.debug('ProcessingMetadata item sanitized for DynamoDB', {
        executionId: metadata.executionId,
        originalKeys: Object.keys(item),
        sanitizedKeys: Object.keys(sanitizedItem)
      });
      
      const command = new PutCommand({
        TableName: this.tableName,
        Item: sanitizedItem
      });

      await this.dynamoClient.send(command);
      
      logger.info('Successfully saved processing metadata', {
        processingId: metadata.processingId
      });

    } catch (error) {
      logger.error('Failed to save processing metadata to DynamoDB', {
        processingId: metadata.processingId,
        tableName: this.tableName,
        error
      });
      throw error;
    }
  }

  /**
   * 処理メタデータを更新
   * @param metadata 更新する処理メタデータオブジェクト
   */
  async update(metadata: ProcessingMetadata): Promise<void> {
    logger.info('Updating processing metadata in DynamoDB', {
      processingId: metadata.processingId,
      tableName: this.tableName
    });

    try {
      const item = metadata.toDynamoDbItem();
      
      const command = new UpdateCommand({
        TableName: this.tableName,
        Key: { processing_id: metadata.processingId },
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt, #processedRecords = :processedRecords, #errorRecords = :errorRecords, #progress = :progress',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updated_at',
          '#processedRecords': 'processed_records',
          '#errorRecords': 'error_records',
          '#progress': 'progress'
        },
        ExpressionAttributeValues: {
          ':status': item.status,
          ':updatedAt': item.updated_at,
          ':processedRecords': item.processed_records,
          ':errorRecords': item.error_records,
          ':progress': item.progress
        }
      });

      await this.dynamoClient.send(command);
      
      logger.info('Successfully updated processing metadata', {
        processingId: metadata.processingId
      });

    } catch (error) {
      logger.error('Failed to update processing metadata in DynamoDB', {
        processingId: metadata.processingId,
        tableName: this.tableName,
        error
      });
      throw error;
    }
  }

  /**
   * 処理IDで処理メタデータを取得
   * @param processingId 処理ID
   * @returns 処理メタデータ（存在しない場合はnull）
   */
  async findByProcessingId(processingId: string): Promise<ProcessingMetadata | null> {
    logger.info('Finding processing metadata by processing ID', { processingId, tableName: this.tableName });

    try {
      const command = new GetCommand({
        TableName: this.tableName,
        Key: { processing_id: processingId }
      });

      const response = await this.dynamoClient.send(command);
      
      if (!response.Item) {
        return null;
      }
      
      const metadata = ProcessingMetadata.fromDynamoDbItem(response.Item);
      
      logger.info('Successfully found processing metadata', { processingId });
      return metadata;

    } catch (error) {
      logger.error('Failed to find processing metadata by processing ID', {
        processingId,
        tableName: this.tableName,
        error
      });
      throw error;
    }
  }

  /**
   * ファイル名で処理メタデータを検索
   * @param fileName ファイル名
   * @param limit 取得件数制限（デフォルト10）
   * @returns 処理メタデータ配列
   */
  async findByFileName(fileName: string, limit: number = 10): Promise<ProcessingMetadata[]> {
    logger.info('Finding processing metadata by file name', { fileName, limit, tableName: this.tableName });

    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'FileNameIndex', // GSI
        KeyConditionExpression: 'file_name = :fileName',
        ExpressionAttributeValues: {
          ':fileName': fileName
        },
        Limit: limit,
        ScanIndexForward: false // 新しい順
      });

      const response = await this.dynamoClient.send(command);
      const items = response.Items || [];
      
      const metadataList = items.map(item => ProcessingMetadata.fromDynamoDbItem(item));
      
      logger.info('Successfully found processing metadata by file name', {
        fileName,
        resultCount: metadataList.length
      });

      return metadataList;

    } catch (error) {
      logger.error('Failed to find processing metadata by file name', {
        fileName,
        tableName: this.tableName,
        error
      });
      throw error;
    }
  }

  /**
   * ステータスで処理メタデータを検索
   * @param status 処理ステータス
   * @param limit 取得件数制限（デフォルト100）
   * @returns 処理メタデータ配列
   */
  async findByStatus(status: string, limit: number = 100): Promise<ProcessingMetadata[]> {
    logger.info('Finding processing metadata by status', { status, limit, tableName: this.tableName });

    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'StatusIndex', // GSI
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': status
        },
        Limit: limit,
        ScanIndexForward: false // 新しい順
      });

      const response = await this.dynamoClient.send(command);
      const items = response.Items || [];
      
      const metadataList = items.map(item => ProcessingMetadata.fromDynamoDbItem(item));
      
      logger.info('Successfully found processing metadata by status', {
        status,
        resultCount: metadataList.length
      });

      return metadataList;

    } catch (error) {
      logger.error('Failed to find processing metadata by status', {
        status,
        tableName: this.tableName,
        error
      });
      throw error;
    }
  }

  /**
   * 処理中のメタデータを取得
   * @param limit 取得件数制限（デフォルト50）
   * @returns 処理中メタデータ配列
   */
  async findProcessingItems(limit: number = 50): Promise<ProcessingMetadata[]> {
    return await this.findByStatus('PROCESSING', limit);
  }

  /**
   * 完了した処理メタデータを取得
   * @param startTime 開始時間（オプション）
   * @param endTime 終了時間（オプション）
   * @param limit 取得件数制限（デフォルト100）
   * @returns 完了メタデータ配列
   */
  async findCompletedItems(startTime?: Date, endTime?: Date, limit: number = 100): Promise<ProcessingMetadata[]> {
    const completedItems = await this.findByStatus('COMPLETED', limit);
    
    // 時間範囲フィルタリング（簡易実装）
    if (startTime || endTime) {
      return completedItems.filter(item => {
        if (startTime && item.updatedAt < startTime) return false;
        if (endTime && item.updatedAt > endTime) return false;
        return true;
      });
    }
    
    return completedItems;
  }

  /**
   * エラー発生した処理メタデータを取得
   * @param startTime 開始時間（オプション）
   * @param endTime 終了時間（オプション）
   * @param limit 取得件数制限（デフォルト100）
   * @returns エラーメタデータ配列
   */
  async findErrorItems(startTime?: Date, endTime?: Date, limit: number = 100): Promise<ProcessingMetadata[]> {
    const errorItems = await this.findByStatus('ERROR', limit);
    
    // 時間範囲フィルタリング（簡易実装）
    if (startTime || endTime) {
      return errorItems.filter(item => {
        if (startTime && item.updatedAt < startTime) return false;
        if (endTime && item.updatedAt > endTime) return false;
        return true;
      });
    }
    
    return errorItems;
  }

  /**
   * 処理メタデータを削除
   * @param processingId 処理ID
   */
  async delete(processingId: string): Promise<void> {
    logger.info('Deleting processing metadata from DynamoDB', { processingId, tableName: this.tableName });

    try {
      const command = new DeleteCommand({
        TableName: this.tableName,
        Key: { processing_id: processingId }
      });

      await this.dynamoClient.send(command);
      
      logger.info('Successfully deleted processing metadata', { processingId });

    } catch (error) {
      logger.error('Failed to delete processing metadata from DynamoDB', {
        processingId,
        tableName: this.tableName,
        error
      });
      throw error;
    }
  }

  /**
   * 古い完了済み処理メタデータを削除
   * @param cutoffDate 削除対象日付
   * @returns 削除件数
   */
  async deleteCompletedItems(cutoffDate: Date): Promise<number> {
    logger.info('Deleting old completed processing metadata', { cutoffDate, tableName: this.tableName });

    try {
      // 完了済みアイテムを取得
      const completedItems = await this.findByStatus('COMPLETED', 1000);
      
      // 削除対象をフィルタリング
      const itemsToDelete = completedItems.filter(item => item.updatedAt < cutoffDate);
      
      // 削除実行
      let deletedCount = 0;
      for (const item of itemsToDelete) {
        await this.delete(item.processingId);
        deletedCount++;
      }
      
      logger.info('Successfully deleted old completed processing metadata', {
        deletedCount,
        cutoffDate
      });

      return deletedCount;

    } catch (error) {
      logger.error('Failed to delete old completed processing metadata', {
        cutoffDate,
        tableName: this.tableName,
        error
      });
      throw error;
    }
  }

  /**
   * 処理統計を取得
   * @param startTime 開始時間
   * @param endTime 終了時間
   * @returns 処理統計
   */
  async getProcessingStatistics(startTime: Date, endTime: Date): Promise<{
    totalProcessed: number;
    successCount: number;
    errorCount: number;
    averageProcessingTime: number;
    statusBreakdown: Record<string, number>;
  }> {
    logger.info('Getting processing statistics', { startTime, endTime, tableName: this.tableName });

    try {
      // 簡易実装：各ステータスのアイテムを取得
      const completedItems = await this.findCompletedItems(startTime, endTime, 1000);
      const errorItems = await this.findErrorItems(startTime, endTime, 1000);
      const processingItems = await this.findProcessingItems(1000);
      
      const totalProcessed = completedItems.length + errorItems.length;
      const successCount = completedItems.length;
      const errorCount = errorItems.length;
      
      // 平均処理時間計算（完了アイテムのみ）
      let totalProcessingTime = 0;
      completedItems.forEach(item => {
        const processingTime = item.updatedAt.getTime() - item.createdAt.getTime();
        totalProcessingTime += processingTime;
      });
      const averageProcessingTime = completedItems.length > 0 ? totalProcessingTime / completedItems.length : 0;
      
      const statusBreakdown: Record<string, number> = {
        COMPLETED: completedItems.length,
        ERROR: errorItems.length,
        PROCESSING: processingItems.length
      };

      const statistics = {
        totalProcessed,
        successCount,
        errorCount,
        averageProcessingTime: Math.round(averageProcessingTime / 1000), // 秒単位
        statusBreakdown
      };
      
      logger.info('Successfully calculated processing statistics', statistics);
      return statistics;

    } catch (error) {
      logger.error('Failed to get processing statistics', {
        startTime,
        endTime,
        tableName: this.tableName,
        error
      });
      throw error;
    }
  }
}