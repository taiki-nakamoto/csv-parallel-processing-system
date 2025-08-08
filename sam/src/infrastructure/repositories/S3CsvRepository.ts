import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, CopyObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from '@aws-lambda-powertools/logger';
import { IS3Repository } from '@domain/interfaces/IS3Repository';

const logger = new Logger({ serviceName: 's3-csv-repository' });

/**
 * S3 CSVリポジトリ（インフラストラクチャ層）
 * IS3Repositoryインターフェースの実装
 */
export class S3CsvRepository implements IS3Repository {
  private s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'ap-northeast-1'
    });
  }

  /**
   * S3からCSVファイルの内容を取得
   * @param bucketName S3バケット名
   * @param objectKey オブジェクトキー
   * @returns CSVファイルの内容
   */
  async getCsvContent(bucketName: string, objectKey: string): Promise<string> {
    logger.info('Getting CSV content from S3', { bucketName, objectKey });

    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new Error('S3 object body is empty');
      }

      // StreamをStringに変換
      const content = await this.streamToString(response.Body as any);
      
      logger.info('Successfully retrieved CSV content', {
        bucketName,
        objectKey,
        contentLength: content.length
      });

      return content;

    } catch (error) {
      logger.error('Failed to get CSV content from S3', {
        bucketName,
        objectKey,
        error
      });
      throw error;
    }
  }

  /**
   * S3にCSVファイルを保存
   * @param bucketName S3バケット名
   * @param objectKey オブジェクトキー
   * @param content CSVファイルの内容
   * @param metadata メタデータ
   */
  async putCsvContent(
    bucketName: string, 
    objectKey: string, 
    content: string,
    metadata?: Record<string, string>
  ): Promise<void> {
    logger.info('Putting CSV content to S3', { bucketName, objectKey });

    try {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: content,
        ContentType: 'text/csv',
        Metadata: metadata || {}
      });

      await this.s3Client.send(command);
      
      logger.info('Successfully put CSV content to S3', {
        bucketName,
        objectKey,
        contentLength: content.length
      });

    } catch (error) {
      logger.error('Failed to put CSV content to S3', {
        bucketName,
        objectKey,
        error
      });
      throw error;
    }
  }

  /**
   * CSVファイルが存在するかチェック
   * @param bucketName S3バケット名
   * @param objectKey オブジェクトキー
   * @returns ファイル存在フラグ
   */
  async csvExists(bucketName: string, objectKey: string): Promise<boolean> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey
      });

      await this.s3Client.send(command);
      return true;

    } catch (error: any) {
      if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * StreamをStringに変換するヘルパーメソッド
   * @param stream Readable stream
   * @returns 文字列
   */
  private async streamToString(stream: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: any[] = [];
      stream.on('data', (chunk: any) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
  }

  /**
   * CSVファイルのメタデータを取得
   * @param bucketName S3バケット名
   * @param objectKey オブジェクトキー
   * @returns ファイルメタデータ
   */
  async getCsvMetadata(bucketName: string, objectKey: string): Promise<{
    contentLength: number;
    lastModified: Date;
    contentType: string;
    metadata: Record<string, string>;
  }> {
    logger.info('Getting CSV metadata from S3', { bucketName, objectKey });

    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey
      });

      const response = await this.s3Client.send(command);

      return {
        contentLength: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        contentType: response.ContentType || 'unknown',
        metadata: response.Metadata || {}
      };

    } catch (error) {
      logger.error('Failed to get CSV metadata from S3', {
        bucketName,
        objectKey,
        error
      });
      throw error;
    }
  }

  /**
   * 処理結果ファイルを保存
   * @param bucketName S3バケット名
   * @param objectKey オブジェクトキー
   * @param content 処理結果の内容
   * @param contentType コンテンツタイプ（デフォルト: text/csv）
   */
  async putProcessedFile(
    bucketName: string, 
    objectKey: string, 
    content: string,
    contentType: string = 'text/csv'
  ): Promise<void> {
    logger.info('Putting processed file to S3', { bucketName, objectKey, contentType });

    try {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: content,
        ContentType: contentType,
        Metadata: {
          processedAt: new Date().toISOString(),
          processor: 'csv-parallel-processing-system'
        }
      });

      await this.s3Client.send(command);
      
      logger.info('Successfully put processed file to S3', {
        bucketName,
        objectKey,
        contentLength: content.length
      });

    } catch (error) {
      logger.error('Failed to put processed file to S3', {
        bucketName,
        objectKey,
        error
      });
      throw error;
    }
  }

  /**
   * ファイルを削除
   * @param bucketName S3バケット名
   * @param objectKey オブジェクトキー
   */
  async deleteFile(bucketName: string, objectKey: string): Promise<void> {
    logger.info('Deleting file from S3', { bucketName, objectKey });

    try {
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: objectKey
      });

      await this.s3Client.send(command);
      
      logger.info('Successfully deleted file from S3', { bucketName, objectKey });

    } catch (error) {
      logger.error('Failed to delete file from S3', {
        bucketName,
        objectKey,
        error
      });
      throw error;
    }
  }

  /**
   * プレフィックスによるファイル一覧取得
   * @param bucketName S3バケット名
   * @param prefix プレフィックス
   * @param maxKeys 最大取得件数（デフォルト: 1000）
   * @returns ファイル情報配列
   */
  async listFiles(bucketName: string, prefix: string, maxKeys: number = 1000): Promise<{
    key: string;
    lastModified: Date;
    size: number;
  }[]> {
    logger.info('Listing files from S3', { bucketName, prefix, maxKeys });

    try {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys
      });

      const response = await this.s3Client.send(command);
      const objects = response.Contents || [];
      
      const files = objects.map(obj => ({
        key: obj.Key || '',
        lastModified: obj.LastModified || new Date(),
        size: obj.Size || 0
      }));

      logger.info('Successfully listed files from S3', {
        bucketName,
        prefix,
        fileCount: files.length
      });

      return files;

    } catch (error) {
      logger.error('Failed to list files from S3', {
        bucketName,
        prefix,
        error
      });
      throw error;
    }
  }

  /**
   * ファイルをコピー
   * @param sourceBucket コピー元バケット名
   * @param sourceKey コピー元オブジェクトキー
   * @param destinationBucket コピー先バケット名
   * @param destinationKey コピー先オブジェクトキー
   */
  async copyObject(
    sourceBucket: string,
    sourceKey: string,
    destinationBucket: string,
    destinationKey: string
  ): Promise<void> {
    logger.info('Copying object in S3', {
      sourceBucket,
      sourceKey,
      destinationBucket,
      destinationKey
    });

    try {
      const command = new CopyObjectCommand({
        CopySource: `${sourceBucket}/${sourceKey}`,
        Bucket: destinationBucket,
        Key: destinationKey
      });

      await this.s3Client.send(command);
      
      logger.info('Successfully copied object in S3', {
        sourceBucket,
        sourceKey,
        destinationBucket,
        destinationKey
      });

    } catch (error) {
      logger.error('Failed to copy object in S3', {
        sourceBucket,
        sourceKey,
        destinationBucket,
        destinationKey,
        error
      });
      throw error;
    }
  }
}