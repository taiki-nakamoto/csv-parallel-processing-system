import { Context, S3Event, S3EventRecord, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { CsvValidationService } from '@application/services/CsvValidationService';
import { DIContainer } from '@infrastructure/di/DIContainer';

// Powertools初期化
const logger = new Logger({ serviceName: 'csv-validation-controller' });
const tracer = new Tracer({ serviceName: 'csv-validation-controller' });
const metrics = new Metrics({ serviceName: 'csv-validation-controller' });

/**
 * CSVバリデーションコントローラー
 * S3にアップロードされたCSVファイルの構造・データ検証を行う
 * DIContainer を使用した依存性注入パターンを採用
 */
export class CsvValidationController {
  private csvValidationService: CsvValidationService;
  private container: DIContainer;

  constructor(container: DIContainer) {
    this.container = container;
    
    // DIコンテナから依存関係を注入
    const s3Repository = container.getS3Repository();
    const auditRepository = container.getAuditLogRepository();
    
    this.csvValidationService = new CsvValidationService(
      s3Repository,
      auditRepository
    );
  }

  /**
   * API Gateway経由のCSV検証（統合ハンドラー用）
   * @param event API Gateway Event
   * @returns APIGatewayProxyResult
   */
  async validateCsv(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    logger.info('Processing CSV validation via API Gateway', { 
      path: event.path,
      method: event.httpMethod 
    });
    
    try {
      // リクエストボディからパラメータを取得
      const body = event.body ? JSON.parse(event.body) : {};
      const { bucketName, objectKey } = body;
      
      if (!bucketName || !objectKey) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Missing required parameters',
            message: 'bucketName and objectKey are required'
          })
        };
      }
      
      // CSV検証実行
      const validationResult = await this.csvValidationService.validateCsvFile({
        bucketName,
        objectKey,
        eventTime: new Date(),
        eventName: 'api-gateway-validation'
      });
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'CSV validation completed',
          result: validationResult
        })
      };
      
    } catch (error) {
      logger.error('CSV validation failed', { error });
      
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Validation failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      };
    }
  }

  /**
   * Step Functions用CSV検証（統合ハンドラー用）
   * @param event Step Functions Event
   * @returns 処理結果
   */
  async validateCsvForStepFunctions(event: any): Promise<any> {
    logger.info('Processing CSV validation for Step Functions', { event });
    
    try {
      const { bucketName, objectKey, processingId } = event;
      
      if (!bucketName || !objectKey) {
        throw new Error('Missing required parameters: bucketName and objectKey');
      }
      
      // CSV検証実行
      const validationResult = await this.csvValidationService.validateCsvFile({
        bucketName,
        objectKey,
        eventTime: new Date(),
        eventName: 'step-functions-validation'
      });
      
      return {
        processingId: processingId || `validation-${Date.now()}`,
        bucketName,
        objectKey,
        validationResult,
        status: validationResult.isValid ? 'VALID' : 'INVALID',
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('Step Functions CSV validation failed', { error });
      throw error;
    }
  }

  /**
   * S3イベントハンドラー（レガシー互換性のため保持）
   * @param event S3Event
   * @param context Lambda Context
   * @returns 処理結果
   */
  @tracer.captureLambdaHandler()
  @logger.injectLambdaContext()
  @metrics.logMetrics()
  async handle(event: S3Event, context: Context): Promise<any> {
    logger.info('CSV validation process started', { event, context });
    
    try {
      const results = [];
      
      // S3イベント内の各レコードを処理
      for (const record of event.Records) {
        logger.info('Processing S3 record', { record });
        
        const result = await this.processS3Record(record);
        results.push(result);
      }
      
      // メトリクス記録
      metrics.addMetrics('ProcessedFiles', 'Count', results.length);
      
      logger.info('CSV validation process completed', { results });
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'CSV validation completed successfully',
          processedFiles: results.length,
          results: results
        })
      };
      
    } catch (error) {
      logger.error('CSV validation process failed', { error });
      
      // エラーメトリクス記録
      metrics.addMetrics('ValidationErrors', 'Count', 1);
      
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'CSV validation failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      };
    }
  }

  /**
   * 個別のS3レコードを処理
   * @param record S3EventRecord
   * @returns 処理結果
   */
  private async processS3Record(record: S3EventRecord): Promise<any> {
    const bucketName = record.s3.bucket.name;
    const objectKey = decodeURIComponent(record.s3.object.key.replace(/\\+/g, ' '));
    
    logger.info('Processing CSV file', { bucketName, objectKey });
    
    try {
      // CSVファイルのバリデーション実行
      const validationResult = await this.csvValidationService.validateCsvFile({
        bucketName,
        objectKey,
        eventTime: new Date(record.eventTime),
        eventName: record.eventName
      });
      
      logger.info('CSV validation completed', { 
        bucketName, 
        objectKey, 
        isValid: validationResult.isValid,
        errors: validationResult.errors
      });
      
      return {
        bucketName,
        objectKey,
        status: validationResult.isValid ? 'valid' : 'invalid',
        errors: validationResult.errors,
        metadata: validationResult.metadata
      };
      
    } catch (error) {
      logger.error('Failed to process CSV file', { 
        bucketName, 
        objectKey, 
        error 
      });
      
      return {
        bucketName,
        objectKey,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Legacy Lambda Handler関数（統合ハンドラーに統合されたため非推奨）
// 互換性のため残しているが、新しいシステムでは src/handler.ts を使用すること
// const container = DIContainer.getInstance();
// const controller = new CsvValidationController(container);
// 
// export const handler = async (event: S3Event, context: Context): Promise<any> => {
//   return await controller.handle(event, context);
// };