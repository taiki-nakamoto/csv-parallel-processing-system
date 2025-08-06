import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics } from '@aws-lambda-powertools/metrics';

// Infrastructure
import { DIContainer } from '@infrastructure/di/DIContainer';

// Controllers
import { CsvValidationController } from '@controllers/CsvValidationController';
import { ChunkProcessingController } from './controllers/ChunkProcessingController';
import { ResultAggregationController } from './controllers/ResultAggregationController';
import { AuditLoggingController } from './controllers/AuditLoggingController';
import { ErrorHandlingController } from './controllers/ErrorHandlingController';

// Models and Types（今後実装予定）
// import { EventParser } from '@utils/EventParser';
// import { ErrorHandler } from '@utils/ErrorHandler';

const logger = new Logger({ serviceName: 'csv-processor-lambda' });
const tracer = new Tracer({ serviceName: 'csv-processor-lambda' });
const metrics = new Metrics({ serviceName: 'csv-processor-lambda', namespace: 'CSVProcessing' });

/**
 * イベントタイプ定義
 */
export enum EventType {
  CSV_VALIDATION = 'csv-validation',
  CSV_CHUNK_PROCESSING = 'csv-chunk-processing', 
  CSV_MERGE = 'csv-merge',
  AUDIT_LOGGING = 'audit-logging',
  ERROR_HANDLING = 'error-handling',
  USER_VALIDATION = 'user-validation',
  BATCH_STATUS_UPDATE = 'batch-status-update'
}

/**
 * 統合Lambda関数のメインハンドラー
 * eventType に基づいて適切な処理に振り分け
 */
export const handler = async (
  event: APIGatewayProxyEvent | any,
  context: Context
): Promise<APIGatewayProxyResult | any> => {
  
  // Lambda context から実行ID等を取得
  const executionId = context.awsRequestId;
  
  logger.addContext(context);
  tracer.addServiceNameAnnotation();
  tracer.addResponseAsMetadata();
  
  logger.info('Lambda function invoked', {
    executionId,
    functionName: context.functionName,
    eventType: event.eventType || 'unknown'
  });

  try {
    // DIコンテナを初期化
    const container = DIContainer.getInstance();
    
    // イベントタイプを取得（複数のイベントソースに対応）
    const eventType = getEventType(event);
    
    logger.info('Processing event', { eventType, executionId });
    metrics.addMetric('EventProcessed', 'Count', 1, { eventType });
    
    // 監査ログの保存（処理開始）
    await logAuditEvent(container, executionId, eventType, 'PROCESSING_STARTED', event);
    
    let result: any;
    
    // eventTypeに基づく処理の振り分け
    switch (eventType) {
      case EventType.CSV_VALIDATION:
        result = await handleCsvValidation(container, event, executionId);
        break;
        
      case EventType.CSV_CHUNK_PROCESSING:
        result = await handleCsvChunkProcessing(container, event, executionId);
        break;
        
      case EventType.CSV_MERGE:
        result = await handleCsvMerge(container, event, executionId);
        break;
        
      case EventType.AUDIT_LOGGING:
        result = await handleAuditLogging(container, event, executionId);
        break;

      case EventType.ERROR_HANDLING:
        result = await handleErrorHandling(container, event, context);
        break;
        
      case EventType.USER_VALIDATION:
        result = await handleUserValidation(container, event, executionId);
        break;
        
      case EventType.BATCH_STATUS_UPDATE:
        result = await handleBatchStatusUpdate(container, event, executionId);
        break;
        
      default:
        throw new Error(`Unsupported event type: ${eventType}`);
    }
    
    // 監査ログの保存（処理完了）
    await logAuditEvent(container, executionId, eventType, 'PROCESSING_COMPLETED', { result });
    
    logger.info('Event processing completed successfully', {
      eventType,
      executionId,
      resultType: typeof result
    });
    
    metrics.addMetric('EventProcessedSuccessfully', 'Count', 1, { eventType });
    
    return result;
    
  } catch (error) {
    logger.error('Error processing event', {
      error: error.message,
      stack: error.stack,
      executionId,
      eventType: event.eventType || 'unknown'
    });
    
    metrics.addMetric('EventProcessingError', 'Count', 1, {
      eventType: event.eventType || 'unknown',
      errorType: error.constructor.name
    });
    
    // エラー監査ログの保存
    try {
      const container = DIContainer.getInstance();
      await logAuditEvent(container, executionId, event.eventType || 'unknown', 'PROCESSING_ERROR', {
        error: error.message,
        stack: error.stack
      });
    } catch (auditError) {
      logger.error('Failed to save audit log for error', { auditError });
    }
    
    // API Gateway形式の場合
    if (event.httpMethod) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Internal Server Error',
          message: error.message,
          executionId
        })
      };
    }
    
    // Step Functions等の場合
    throw error;
  } finally {
    // メトリクスを送信
    metrics.publishStoredMetrics();
  }
};

/**
 * イベントタイプを判定
 * @param event Lambda event
 * @returns EventType
 */
function getEventType(event: any): EventType {
  // 直接eventTypeが指定されている場合
  if (event.eventType) {
    return event.eventType;
  }
  
  // API Gateway経由の場合
  if (event.httpMethod && event.pathParameters) {
    const path = event.pathParameters.proxy || event.pathParameters.eventType;
    switch (path) {
      case 'validate':
        return EventType.CSV_VALIDATION;
      case 'process':
        return EventType.CSV_CHUNK_PROCESSING;
      case 'merge':
        return EventType.CSV_MERGE;
      default:
        return EventType.CSV_VALIDATION;
    }
  }
  
  // Step Functions経由の場合
  if (event.source === 'stepfunctions' || event.StateMachine) {
    // ステートマシンからのイベントの場合、ステート名で判定
    const stateName = event.StateName || event.taskType;
    switch (stateName) {
      case 'ValidateCSV':
        return EventType.CSV_VALIDATION;
      case 'ProcessChunk':
        return EventType.CSV_CHUNK_PROCESSING;
      case 'MergeResults':
        return EventType.CSV_MERGE;
      case 'ValidateUsers':
        return EventType.USER_VALIDATION;
      case 'UpdateBatchStatus':
        return EventType.BATCH_STATUS_UPDATE;
      default:
        return EventType.CSV_VALIDATION;
    }
  }
  
  // S3イベントの場合
  if (event.Records && event.Records[0] && event.Records[0].s3) {
    return EventType.CSV_VALIDATION;
  }
  
  // デフォルト
  return EventType.CSV_VALIDATION;
}

/**
 * CSV検証処理
 */
async function handleCsvValidation(
  container: DIContainer,
  event: any,
  executionId: string
): Promise<any> {
  logger.info('Handling CSV validation', { executionId });
  
  const controller = new CsvValidationController(container);
  
  // API Gateway形式の場合
  if (event.httpMethod) {
    return await controller.validateCsv(event);
  }
  
  // Step Functions形式の場合
  return await controller.validateCsvForStepFunctions(event);
}

/**
 * CSVチャンク処理
 */
async function handleCsvChunkProcessing(
  container: DIContainer,
  event: any,
  executionId: string
): Promise<any> {
  logger.info('Handling CSV chunk processing', { 
    executionId,
    batchId: event.batchId,
    itemCount: event.items?.length
  });
  
  // DIコンテナからサービスを取得
  const chunkProcessingService = container.getChunkProcessingService();
  
  // ChunkProcessingControllerを初期化
  const controller = new ChunkProcessingController(chunkProcessingService);
  
  // チャンク処理実行
  const result = await controller.processChunk(event);
  
  logger.info('CSV chunk processing completed', {
    executionId,
    batchId: event.batchId,
    processedCount: result.processedCount,
    successCount: result.successCount,
    errorCount: result.errorCount
  });
  
  return result;
}

/**
 * CSV結果マージ処理（結果集約機能）
 */
async function handleCsvMerge(
  container: DIContainer,
  event: any,
  executionId: string
): Promise<any> {
  logger.info('Handling CSV result aggregation', { 
    executionId,
    mapRunId: event.mapRunId,
    totalItems: event.statistics?.totalItems
  });
  
  // DIコンテナから結果集約サービスを取得
  const resultAggregationService = container.getResultAggregationService();
  
  // ResultAggregationControllerを初期化
  const controller = new ResultAggregationController(resultAggregationService);
  
  // 結果集約実行
  const result = await controller.aggregateResults(event);
  
  logger.info('CSV result aggregation completed', {
    executionId,
    totalProcessed: result.aggregationSummary?.totalProcessed,
    successRate: result.aggregationSummary?.successRate,
    outputLocation: result.outputLocation?.s3Key
  });
  
  return result;
}

/**
 * 監査ログ記録処理
 */
async function handleAuditLogging(
  container: DIContainer,
  event: any,
  executionId: string
): Promise<any> {
  logger.info('Handling audit logging', {
    executionId,
    auditEventType: event.auditEventType,
    logLevel: event.logLevel
  });

  // DIコンテナから監査ログサービスを取得
  const auditLoggingService = container.getAuditLoggingService();

  // AuditLoggingControllerを初期化
  const controller = new AuditLoggingController(auditLoggingService);

  // 監査ログ記録実行
  const result = await controller.recordAuditLog({
    executionId: event.executionId || executionId,
    eventType: event.auditEventType || 'UNKNOWN',
    logLevel: event.logLevel || 'INFO',
    functionName: event.functionName || 'csv-processor',
    message: event.message || 'Audit log entry',
    metadata: event.metadata,
    correlationId: event.correlationId,
    userId: event.userId
  });

  logger.info('Audit logging completed', {
    executionId,
    success: result.success,
    logId: result.logId
  });

  return result;
}

/**
 * ユーザー検証処理
 */
async function handleUserValidation(
  container: DIContainer,
  event: any,
  executionId: string
): Promise<any> {
  logger.info('Handling user validation', { executionId });
  
  // 今後実装
  throw new Error('User validation processing not yet implemented');
}

/**
 * エラーハンドリング処理
 */
async function handleErrorHandling(
  container: DIContainer,
  event: any,
  context: Context
): Promise<any> {
  logger.info('Handling error processing', {
    executionId: context.awsRequestId,
    errorType: event.errorType,
    errorHandlingType: event.errorHandlingType
  });

  // ErrorHandlingControllerを作成
  const controller = ErrorHandlingController.create();

  // リクエストタイプに基づいて処理を分岐
  if (event.httpMethod) {
    // API Gateway経由の場合
    const path = event.pathParameters?.proxy || event.pathParameters?.operation;
    
    switch (path) {
      case 'handle-single':
        return await controller.handleSingleError(event, context);
      case 'handle-batch':
        return await controller.handleErrorBatch(event, context);
      case 'statistics':
        return await controller.getErrorStatistics(event, context);
      default:
        return await controller.handleSingleError(event, context);
    }
  } else {
    // Step Functions等からの直接呼び出しの場合
    if (event.errors && Array.isArray(event.errors)) {
      return await controller.handleErrorBatch(event, context);
    } else {
      return await controller.handleSingleError(event, context);
    }
  }
}

/**
 * バッチ状態更新処理
 */
async function handleBatchStatusUpdate(
  container: DIContainer,
  event: any,
  executionId: string
): Promise<any> {
  logger.info('Handling batch status update', { executionId });
  
  // 今後実装
  throw new Error('Batch status update processing not yet implemented');
}

/**
 * 監査ログ記録ヘルパー
 */
async function logAuditEvent(
  container: DIContainer,
  executionId: string,
  eventType: string,
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
  data: any
): Promise<void> {
  try {
    // DIコンテナから監査ログサービスを取得
    const auditLoggingService = container.getAuditLoggingService();
    const controller = new AuditLoggingController(auditLoggingService);
    
    // 監査ログ記録
    await controller.recordAuditLog({
      executionId,
      eventType,
      logLevel,
      functionName: 'csv-processor',
      message: `${eventType} - ${logLevel}`,
      metadata: {
        data: JSON.stringify(data),
        timestamp: new Date().toISOString(),
        source: 'handler-audit-helper'
      }
    });
    
    logger.info('Audit log saved', { executionId, eventType, logLevel });
    
  } catch (error) {
    logger.error('Failed to save audit log', { error, executionId, eventType });
    // 監査ログの失敗は処理を止めない
  }
}