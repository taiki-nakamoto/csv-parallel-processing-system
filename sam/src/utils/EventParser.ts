import { Logger } from '@aws-lambda-powertools/logger';
import { APIGatewayProxyEvent, S3Event, S3EventRecord } from 'aws-lambda';

const logger = new Logger({ serviceName: 'event-parser' });

/**
 * イベントパーサーユーティリティ
 * 各種Lambdaイベントを統一形式にパース
 */
export class EventParser {

  /**
   * API Gatewayイベントをパース
   * @param event API Gateway event
   * @returns パース結果
   */
  static parseApiGatewayEvent(event: APIGatewayProxyEvent): ParsedEvent {
    logger.info('Parsing API Gateway event', { 
      path: event.path, 
      method: event.httpMethod 
    });

    try {
      const body = event.body ? JSON.parse(event.body) : {};
      
      return {
        source: 'api-gateway',
        eventType: this.determineEventTypeFromApiGateway(event),
        bucketName: body.bucketName || event.queryStringParameters?.bucketName,
        objectKey: body.objectKey || event.queryStringParameters?.objectKey,
        processingId: body.processingId || event.queryStringParameters?.processingId,
        userId: this.extractUserIdFromApiGateway(event),
        timestamp: new Date(),
        rawEvent: event,
        parameters: {
          ...body,
          ...event.queryStringParameters,
          ...event.pathParameters
        }
      };
    } catch (error) {
      logger.error('Failed to parse API Gateway event', { error, event });
      throw new Error(`Failed to parse API Gateway event: ${error.message}`);
    }
  }

  /**
   * S3イベントをパース
   * @param event S3 event
   * @returns パース結果配列
   */
  static parseS3Event(event: S3Event): ParsedEvent[] {
    logger.info('Parsing S3 event', { recordCount: event.Records.length });

    try {
      return event.Records.map((record, index) => {
        const bucketName = record.s3.bucket.name;
        const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
        
        return {
          source: 's3',
          eventType: 'csv-validation',
          bucketName,
          objectKey,
          processingId: this.generateProcessingId(bucketName, objectKey),
          timestamp: new Date(record.eventTime),
          rawEvent: record,
          parameters: {
            eventName: record.eventName,
            eventVersion: record.eventVersion,
            awsRegion: record.awsRegion,
            fileSize: record.s3.object.size,
            eTag: record.s3.object.eTag
          }
        };
      });
    } catch (error) {
      logger.error('Failed to parse S3 event', { error, event });
      throw new Error(`Failed to parse S3 event: ${error.message}`);
    }
  }

  /**
   * Step Functionsイベントをパース
   * @param event Step Functions event
   * @returns パース結果
   */
  static parseStepFunctionsEvent(event: any): ParsedEvent {
    logger.info('Parsing Step Functions event', { 
      eventType: event.eventType,
      processingId: event.processingId 
    });

    try {
      return {
        source: 'step-functions',
        eventType: event.eventType || 'csv-validation',
        bucketName: event.bucketName,
        objectKey: event.objectKey,
        processingId: event.processingId,
        userId: event.userId,
        timestamp: new Date(),
        rawEvent: event,
        parameters: {
          ...event,
          chunkIndex: event.chunkIndex,
          totalChunks: event.totalChunks,
          chunkSize: event.chunkSize,
          processingMode: event.processingMode
        }
      };
    } catch (error) {
      logger.error('Failed to parse Step Functions event', { error, event });
      throw new Error(`Failed to parse Step Functions event: ${error.message}`);
    }
  }

  /**
   * 汎用イベントパーサー
   * イベントタイプを自動判定してパース
   * @param event Lambda event
   * @returns パース結果
   */
  static parseEvent(event: any): ParsedEvent | ParsedEvent[] {
    logger.info('Auto-parsing event', { eventType: typeof event });

    // API Gateway event
    if (event.httpMethod && event.requestContext) {
      return this.parseApiGatewayEvent(event as APIGatewayProxyEvent);
    }

    // S3 event
    if (event.Records && event.Records[0] && event.Records[0].s3) {
      return this.parseS3Event(event as S3Event);
    }

    // Step Functions event
    if (event.eventType || event.StateMachine || event.bucketName) {
      return this.parseStepFunctionsEvent(event);
    }

    // EventBridge event (今後対応予定)
    if (event.source && event['detail-type']) {
      logger.warn('EventBridge events not yet supported');
      throw new Error('EventBridge events not yet supported');
    }

    // 不明なイベント形式
    logger.error('Unknown event format', { event });
    throw new Error('Unknown event format');
  }

  /**
   * パースされたイベントからバリデーション
   * @param parsedEvent パースされたイベント
   * @returns バリデーション結果
   */
  static validateParsedEvent(parsedEvent: ParsedEvent): ValidationResult {
    const errors: string[] = [];

    // 必須フィールドのチェック
    if (!parsedEvent.source) {
      errors.push('Event source is required');
    }

    if (!parsedEvent.eventType) {
      errors.push('Event type is required');
    }

    // イベントタイプ別のバリデーション
    switch (parsedEvent.eventType) {
      case 'csv-validation':
      case 'csv-chunk-processing':
      case 'csv-merge':
        if (!parsedEvent.bucketName) {
          errors.push('Bucket name is required for CSV events');
        }
        if (!parsedEvent.objectKey) {
          errors.push('Object key is required for CSV events');
        }
        break;
      
      case 'user-validation':
        if (!parsedEvent.userId) {
          errors.push('User ID is required for user validation events');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * API Gatewayイベントからイベントタイプを決定
   * @param event API Gateway event
   * @returns イベントタイプ
   */
  private static determineEventTypeFromApiGateway(event: APIGatewayProxyEvent): string {
    const path = event.path;
    const method = event.httpMethod;

    // パス・メソッドベースのマッピング
    if (path.includes('/validate') && method === 'POST') {
      return 'csv-validation';
    }
    
    if (path.includes('/process') && method === 'POST') {
      return 'csv-chunk-processing';
    }
    
    if (path.includes('/merge') && method === 'POST') {
      return 'csv-merge';
    }
    
    if (path.includes('/users') && method === 'POST') {
      return 'user-validation';
    }

    // デフォルト
    return 'csv-validation';
  }

  /**
   * API GatewayイベントからユーザーIDを抽出
   * @param event API Gateway event
   * @returns ユーザーID
   */
  private static extractUserIdFromApiGateway(event: APIGatewayProxyEvent): string | undefined {
    // Authorization headerからJWTを解析してユーザーIDを取得
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    
    if (authHeader) {
      // 簡易実装：実際のプロジェクトではJWTライブラリを使用すること
      try {
        const token = authHeader.replace('Bearer ', '');
        // JWTデコードロジック（今後実装）
        // const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // return decoded.userId;
        logger.warn('JWT decoding not implemented, returning mock user ID');
        return 'mock-user-id';
      } catch (error) {
        logger.error('Failed to extract user ID from JWT', { error });
      }
    }

    // Cognito User Poolsからの情報取得（今後実装）
    const cognitoUserId = event.requestContext?.authorizer?.claims?.sub;
    if (cognitoUserId) {
      return cognitoUserId;
    }

    return undefined;
  }

  /**
   * 処理IDを生成
   * @param bucketName S3バケット名
   * @param objectKey S3オブジェクトキー
   * @returns 処理ID
   */
  private static generateProcessingId(bucketName: string, objectKey: string): string {
    const timestamp = Date.now();
    const hash = this.simpleHash(`${bucketName}/${objectKey}/${timestamp}`);
    return `proc-${timestamp}-${hash}`;
  }

  /**
   * 簡易ハッシュ関数
   * @param str 文字列
   * @returns ハッシュ値
   */
  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit整数に変換
    }
    return Math.abs(hash).toString(36);
  }
}

/**
 * パースされたイベント形式
 */
export interface ParsedEvent {
  source: 'api-gateway' | 's3' | 'step-functions' | 'eventbridge';
  eventType: string;
  bucketName?: string;
  objectKey?: string;
  processingId?: string;
  userId?: string;
  timestamp: Date;
  rawEvent: any;
  parameters: Record<string, any>;
}

/**
 * バリデーション結果
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}