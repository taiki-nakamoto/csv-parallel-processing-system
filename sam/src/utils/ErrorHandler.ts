import { Logger } from '@aws-lambda-powertools/logger';
import { APIGatewayProxyResult } from 'aws-lambda';

const logger = new Logger({ serviceName: 'error-handler' });

/**
 * エラーハンドラーユーティリティ
 * アプリケーション全体で統一されたエラー処理を提供
 */
export class ErrorHandler {

  /**
   * Lambda関数用の統合エラーハンドリング
   * @param error エラーオブジェクト
   * @param context 実行コンテキスト
   * @param eventType イベントタイプ
   * @returns 適切なレスポンス形式
   */
  static handleLambdaError(
    error: Error, 
    context: { executionId?: string; eventType?: string; isApiGateway?: boolean },
    eventType?: string
  ): APIGatewayProxyResult | any {
    const errorInfo = this.classifyError(error);
    
    logger.error('Lambda function error occurred', {
      executionId: context.executionId,
      eventType: eventType || context.eventType,
      errorType: errorInfo.type,
      errorCode: errorInfo.code,
      message: error.message,
      stack: error.stack
    });

    // API Gateway形式の場合
    if (context.isApiGateway) {
      return this.createApiGatewayErrorResponse(errorInfo, context.executionId);
    }

    // Step Functions形式の場合
    return this.createStepFunctionsErrorResponse(errorInfo, context);
  }

  /**
   * API Gateway用エラーレスポンス作成
   * @param errorInfo エラー情報
   * @param executionId 実行ID
   * @returns API Gateway レスポンス
   */
  static createApiGatewayErrorResponse(
    errorInfo: ClassifiedError, 
    executionId?: string
  ): APIGatewayProxyResult {
    return {
      statusCode: errorInfo.httpStatusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Execution-Id': executionId || 'unknown'
      },
      body: JSON.stringify({
        error: errorInfo.type,
        code: errorInfo.code,
        message: errorInfo.userMessage,
        timestamp: new Date().toISOString(),
        executionId: executionId || 'unknown'
      })
    };
  }

  /**
   * Step Functions用エラーレスポンス作成
   * @param errorInfo エラー情報
   * @param context コンテキスト
   * @returns Step Functions エラーレスポンス
   */
  static createStepFunctionsErrorResponse(
    errorInfo: ClassifiedError,
    context: any
  ): any {
    return {
      errorType: errorInfo.type,
      errorCode: errorInfo.code,
      errorMessage: errorInfo.userMessage,
      executionId: context.executionId,
      timestamp: new Date().toISOString(),
      isRetryable: errorInfo.isRetryable,
      context
    };
  }

  /**
   * エラーを分類
   * @param error エラーオブジェクト
   * @returns 分類されたエラー情報
   */
  static classifyError(error: Error): ClassifiedError {
    // バリデーションエラー
    if (this.isValidationError(error)) {
      return {
        type: 'ValidationError',
        code: 'VALIDATION_FAILED',
        httpStatusCode: 400,
        userMessage: error.message,
        isRetryable: false,
        severity: 'low'
      };
    }

    // リソース不足エラー
    if (this.isResourceError(error)) {
      return {
        type: 'ResourceError',
        code: 'RESOURCE_UNAVAILABLE',
        httpStatusCode: 503,
        userMessage: 'Service temporarily unavailable. Please try again later.',
        isRetryable: true,
        severity: 'medium'
      };
    }

    // 認証・認可エラー
    if (this.isAuthError(error)) {
      return {
        type: 'AuthenticationError',
        code: 'AUTH_FAILED',
        httpStatusCode: 401,
        userMessage: 'Authentication failed. Please check your credentials.',
        isRetryable: false,
        severity: 'medium'
      };
    }

    // 権限エラー
    if (this.isPermissionError(error)) {
      return {
        type: 'AuthorizationError',
        code: 'PERMISSION_DENIED',
        httpStatusCode: 403,
        userMessage: 'Permission denied. You do not have access to this resource.',
        isRetryable: false,
        severity: 'medium'
      };
    }

    // S3エラー
    if (this.isS3Error(error)) {
      return this.classifyS3Error(error);
    }

    // DynamoDBエラー
    if (this.isDynamoDBError(error)) {
      return this.classifyDynamoDBError(error);
    }

    // Lambdaエラー
    if (this.isLambdaError(error)) {
      return {
        type: 'LambdaError',
        code: 'LAMBDA_INVOCATION_FAILED',
        httpStatusCode: 502,
        userMessage: 'Processing service temporarily unavailable.',
        isRetryable: true,
        severity: 'high'
      };
    }

    // タイムアウトエラー
    if (this.isTimeoutError(error)) {
      return {
        type: 'TimeoutError',
        code: 'REQUEST_TIMEOUT',
        httpStatusCode: 408,
        userMessage: 'Request timeout. Please try again with a smaller request.',
        isRetryable: true,
        severity: 'medium'
      };
    }

    // 不明なエラー
    return {
      type: 'InternalServerError',
      code: 'INTERNAL_ERROR',
      httpStatusCode: 500,
      userMessage: 'An internal error occurred. Please try again later.',
      isRetryable: true,
      severity: 'high'
    };
  }

  /**
   * S3エラーの分類
   * @param error S3エラー
   * @returns 分類されたエラー情報
   */
  private static classifyS3Error(error: Error): ClassifiedError {
    const message = error.message.toLowerCase();

    if (message.includes('nosuchkey') || message.includes('not found')) {
      return {
        type: 'S3ObjectNotFoundError',
        code: 'S3_OBJECT_NOT_FOUND',
        httpStatusCode: 404,
        userMessage: 'The requested file was not found.',
        isRetryable: false,
        severity: 'low'
      };
    }

    if (message.includes('access denied') || message.includes('forbidden')) {
      return {
        type: 'S3AccessDeniedError',
        code: 'S3_ACCESS_DENIED',
        httpStatusCode: 403,
        userMessage: 'Access denied to the requested file.',
        isRetryable: false,
        severity: 'medium'
      };
    }

    return {
      type: 'S3Error',
      code: 'S3_OPERATION_FAILED',
      httpStatusCode: 502,
      userMessage: 'File storage service temporarily unavailable.',
      isRetryable: true,
      severity: 'medium'
    };
  }

  /**
   * DynamoDBエラーの分類
   * @param error DynamoDBエラー
   * @returns 分類されたエラー情報
   */
  private static classifyDynamoDBError(error: Error): ClassifiedError {
    const message = error.message.toLowerCase();

    if (message.includes('throttling') || message.includes('provisioned')) {
      return {
        type: 'DynamoDBThrottlingError',
        code: 'DYNAMODB_THROTTLING',
        httpStatusCode: 429,
        userMessage: 'Service is busy. Please try again in a moment.',
        isRetryable: true,
        severity: 'medium'
      };
    }

    if (message.includes('conditionalcheckfailed')) {
      return {
        type: 'DynamoDBConditionalCheckError',
        code: 'DYNAMODB_CONDITION_FAILED',
        httpStatusCode: 409,
        userMessage: 'The requested operation conflicts with the current state.',
        isRetryable: false,
        severity: 'low'
      };
    }

    return {
      type: 'DynamoDBError',
      code: 'DYNAMODB_OPERATION_FAILED',
      httpStatusCode: 502,
      userMessage: 'Database service temporarily unavailable.',
      isRetryable: true,
      severity: 'high'
    };
  }

  /**
   * バリデーションエラーかチェック
   */
  private static isValidationError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('validation') || 
           message.includes('required') || 
           message.includes('invalid') ||
           message.includes('must be') ||
           error.name === 'ValidationError';
  }

  /**
   * リソースエラーかチェック
   */
  private static isResourceError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('resource') || 
           message.includes('limit') || 
           message.includes('quota') ||
           message.includes('memory') ||
           message.includes('disk space');
  }

  /**
   * 認証エラーかチェック
   */
  private static isAuthError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('unauthorized') || 
           message.includes('authentication') || 
           message.includes('token') ||
           message.includes('credentials');
  }

  /**
   * 権限エラーかチェック
   */
  private static isPermissionError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('forbidden') || 
           message.includes('permission') || 
           message.includes('access denied') ||
           message.includes('not allowed');
  }

  /**
   * S3エラーかチェック
   */
  private static isS3Error(error: Error): boolean {
    return error.name?.includes('S3') || 
           error.message?.includes('S3') ||
           error.message?.includes('bucket') ||
           error.message?.includes('object');
  }

  /**
   * DynamoDBエラーかチェック
   */
  private static isDynamoDBError(error: Error): boolean {
    return error.name?.includes('DynamoDB') || 
           error.message?.includes('DynamoDB') ||
           error.message?.includes('dynamodb');
  }

  /**
   * Lambdaエラーかチェック
   */
  private static isLambdaError(error: Error): boolean {
    return error.name?.includes('Lambda') || 
           error.message?.includes('Lambda') ||
           error.message?.includes('invocation');
  }

  /**
   * タイムアウトエラーかチェック
   */
  private static isTimeoutError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('timeout') || 
           message.includes('time out') || 
           message.includes('exceeded') ||
           error.name === 'TimeoutError';
  }

  /**
   * エラーログを標準形式で出力
   * @param error エラーオブジェクト
   * @param context ログコンテキスト
   */
  static logError(error: Error, context: Record<string, any> = {}): void {
    const errorInfo = this.classifyError(error);
    
    logger.error('Application error', {
      errorType: errorInfo.type,
      errorCode: errorInfo.code,
      severity: errorInfo.severity,
      isRetryable: errorInfo.isRetryable,
      message: error.message,
      stack: error.stack,
      ...context
    });
  }

  /**
   * 重大度に応じたアラート判定
   * @param error エラーオブジェクト
   * @returns アラート送信が必要かどうか
   */
  static shouldSendAlert(error: Error): boolean {
    const errorInfo = this.classifyError(error);
    return errorInfo.severity === 'high';
  }

  /**
   * エラー再試行判定
   * @param error エラーオブジェクト
   * @param attemptCount 試行回数
   * @param maxAttempts 最大試行回数
   * @returns 再試行すべきかどうか
   */
  static shouldRetry(error: Error, attemptCount: number, maxAttempts: number = 3): boolean {
    if (attemptCount >= maxAttempts) {
      return false;
    }
    
    const errorInfo = this.classifyError(error);
    return errorInfo.isRetryable;
  }
}

/**
 * 分類されたエラー情報
 */
export interface ClassifiedError {
  type: string;
  code: string;
  httpStatusCode: number;
  userMessage: string;
  isRetryable: boolean;
  severity: 'low' | 'medium' | 'high';
}