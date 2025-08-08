import { Logger } from '@aws-lambda-powertools/logger';
import { ICsvValidationService } from '@application/interfaces/ICsvValidationService';
import { S3CsvRepository } from '@infrastructure/repositories/S3CsvRepository';
import { DynamoDbAuditRepository } from '@infrastructure/repositories/DynamoDbAuditRepository';
import { CsvFile } from '@domain/models/CsvFile';
import { AuditLog } from '@domain/models/AuditLog';
import { CsvValidator, CsvValidationResult, ValidationOptions } from '@domain/services/CsvValidator';
import { ValidationRules } from '@domain/services/ValidationRules';

const logger = new Logger({ serviceName: 'csv-validation-service' });

/**
 * CSVバリデーションサービス（アプリケーション層）
 * CSVファイルの構造・データ検証ビジネスロジックを管理
 */
export class CsvValidationService implements ICsvValidationService {
  private readonly csvValidator: CsvValidator;

  constructor(
    private readonly s3Repository: S3CsvRepository,
    private readonly auditRepository: DynamoDbAuditRepository
  ) {
    this.csvValidator = new CsvValidator();
  }

  /**
   * CSVファイルのバリデーション（完全実装版）
   * @param params バリデーション実行パラメータ
   * @param options バリデーションオプション
   * @returns 設計書準拠の詳細バリデーション結果
   */
  async validateCsvFile(
    params: {
      bucketName: string;
      objectKey: string;
      eventTime: Date;
      eventName: string;
      executionId?: string;
    },
    options: ValidationOptions = {}
  ): Promise<CsvValidationResult> {
    const startTime = Date.now();
    const executionId = params.executionId || `validation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('Starting enhanced CSV validation', { ...params, executionId, options });
    
    try {
      // 監査ログ開始
      const auditLog = new AuditLog({
        executionId,
        timestamp: new Date(),
        eventType: 'CSV_VALIDATION_START',
        logLevel: 'INFO',
        functionName: 'CsvValidationService.validateCsvFile',
        message: 'Enhanced CSV validation started',
        metadata: { ...params, options }
      });
      
      await this.auditRepository.saveAuditLog(auditLog);
      
      // S3からCSVファイルを読み込み
      const csvContent = await this.s3Repository.getCsvContent(
        params.bucketName,
        params.objectKey
      );
      
      // CSVファイルオブジェクト作成
      const csvFile = new CsvFile({
        bucketName: params.bucketName,
        objectKey: params.objectKey,
        content: csvContent,
        uploadTime: params.eventTime
      });
      
      // 設計書準拠の完全バリデーション実行
      const validationResult = await this.csvValidator.validateCsvFile(csvFile, options);
      
      // 処理時間計算（既にvalidationResultに含まれているが、サービス層での総時間も記録）
      const totalProcessingTime = Date.now() - startTime;
      
      // 結果の品質分析
      const qualityAnalysis = this.analyzeValidationQuality(validationResult);
      
      // 監査ログ完了
      const completionLog = new AuditLog({
        executionId,
        timestamp: new Date(),
        eventType: 'CSV_VALIDATION_COMPLETE',
        logLevel: validationResult.isValid ? 'INFO' : 'WARN',
        functionName: 'CsvValidationService.validateCsvFile',
        message: `Enhanced CSV validation ${validationResult.isValid ? 'successful' : 'failed'}`,
        metadata: {
          ...params,
          isValid: validationResult.isValid,
          errorCount: validationResult.errors.length,
          warningCount: validationResult.warnings.length,
          totalRows: validationResult.statistics.totalRows,
          validRows: validationResult.statistics.validRows,
          processingTime: totalProcessingTime,
          qualityScore: qualityAnalysis.qualityScore,
          qualityGrade: qualityAnalysis.qualityGrade
        }
      });
      
      await this.auditRepository.saveAuditLog(completionLog);
      
      logger.info('Enhanced CSV validation completed', {
        ...params,
        isValid: validationResult.isValid,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length,
        qualityScore: qualityAnalysis.qualityScore,
        qualityGrade: qualityAnalysis.qualityGrade,
        processingTime: totalProcessingTime
      });
      
      // 処理用バケットへのコピー（バリデーション成功時のみ）
      if (validationResult.isValid) {
        await this.copyToProcessingBucket(params, executionId);
      }
      
      return {
        ...validationResult,
        // サービス層からの追加メタデータ
        metadata: {
          ...validationResult.metadata,
          executionId,
          serviceName: 'CsvValidationService',
          totalProcessingTime,
          ...qualityAnalysis
        }
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Enhanced CSV validation failed', { 
        ...params, 
        executionId,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        processingTime 
      });
      
      // エラー監査ログ
      const errorLog = new AuditLog({
        executionId,
        timestamp: new Date(),
        eventType: 'CSV_VALIDATION_ERROR',
        logLevel: 'ERROR',
        functionName: 'CsvValidationService.validateCsvFile',
        message: 'Enhanced CSV validation failed with error',
        metadata: {
          ...params,
          error: error instanceof Error ? error.message : 'Unknown error',
          errorType: error instanceof Error ? error.name : 'UnknownError',
          processingTime
        }
      });
      
      await this.auditRepository.saveAuditLog(errorLog);
      
      throw error;
    }
  }

  /**
   * バリデーション品質分析
   * @param result バリデーション結果
   * @returns 品質分析結果
   */
  private analyzeValidationQuality(result: CsvValidationResult): ValidationQualityAnalysis {
    const totalRows = result.statistics.totalRows;
    const validRows = result.statistics.validRows;
    const errorCount = result.errors.length;
    const warningCount = result.warnings.length;
    
    // 品質スコア計算（0-100）
    let qualityScore = 100;
    
    // エラー率による減点
    if (totalRows > 0) {
      const errorRate = errorCount / totalRows;
      qualityScore -= errorRate * 100;
    }
    
    // 警告による軽微な減点
    qualityScore -= Math.min(warningCount * 2, 20);
    
    // 下限設定
    qualityScore = Math.max(0, qualityScore);
    
    // 品質グレード判定
    let qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    if (qualityScore >= 90) qualityGrade = 'A';
    else if (qualityScore >= 80) qualityGrade = 'B';
    else if (qualityScore >= 70) qualityGrade = 'C';
    else if (qualityScore >= 60) qualityGrade = 'D';
    else qualityGrade = 'F';
    
    // エラータイプ別分析
    const errorTypeAnalysis: Record<string, number> = {};
    result.errors.forEach(error => {
      errorTypeAnalysis[error.type] = (errorTypeAnalysis[error.type] || 0) + 1;
    });
    
    // 推奨事項生成
    const recommendations: string[] = [];
    
    if (errorCount > 0) {
      if (errorTypeAnalysis['INVALID_USER_ID_FORMAT']) {
        recommendations.push('Review user ID format. Expected: U00001-U99999');
      }
      if (errorTypeAnalysis['NEGATIVE_VALUE']) {
        recommendations.push('Check for negative values in numeric fields');
      }
      if (errorTypeAnalysis['EMPTY_FIELD']) {
        recommendations.push('Ensure all required fields are populated');
      }
      if (errorTypeAnalysis['MALFORMED_CSV']) {
        recommendations.push('Review CSV structure and formatting');
      }
    }
    
    if (warningCount > 0) {
      recommendations.push('Address warnings to improve data quality');
    }
    
    if (qualityScore < 70) {
      recommendations.push('Consider data quality improvements before processing');
    }
    
    return {
      qualityScore: Math.round(qualityScore * 100) / 100,
      qualityGrade,
      dataCompleteness: totalRows > 0 ? (validRows / totalRows) * 100 : 0,
      errorRate: totalRows > 0 ? (errorCount / totalRows) * 100 : 0,
      warningRate: totalRows > 0 ? (warningCount / totalRows) * 100 : 0,
      errorTypeAnalysis,
      recommendations
    };
  }

  /**
   * 処理用バケットへのファイルコピー
   * @param params バリデーションパラメータ
   * @param executionId 実行ID
   */
  private async copyToProcessingBucket(
    params: { bucketName: string; objectKey: string },
    executionId: string
  ): Promise<void> {
    try {
      // 同一バケット内のprocessingフォルダに移動（別バケット作成を回避）
      const processingBucket = params.bucketName;
      const processingKey = `processing/validated/${executionId}/${params.objectKey.split('/').pop()}`;
      
      logger.info('Copying validated file to processing folder', {
        sourceBucket: params.bucketName,
        sourceKey: params.objectKey,
        targetBucket: processingBucket,
        targetKey: processingKey
      });
      
      await this.s3Repository.copyObject(
        params.bucketName,
        params.objectKey,
        processingBucket,
        processingKey
      );
      
      logger.info('File copied to processing bucket successfully');
      
    } catch (error) {
      logger.error('Failed to copy file to processing bucket', {
        error: error instanceof Error ? error.message : String(error),
        executionId
      });
      // コピー失敗はバリデーション成功を妨げない（警告レベル）
    }
  }

  /**
   * レガシー互換性メソッド（後方互換性のため保持）
   * @deprecated 新しいvalidateCsvFileメソッドを使用してください
   */
  async validateCsvFileLegacy(params: {
    bucketName: string;
    objectKey: string;
    eventTime: Date;
    eventName: string;
  }): Promise<{
    isValid: boolean;
    errors: string[];
    metadata: {
      fileSize: number;
      rowCount: number;
      columnCount: number;
      processingTime: number;
    };
  }> {
    logger.warn('Using deprecated validateCsvFileLegacy method. Please migrate to validateCsvFile.');
    
    const result = await this.validateCsvFile(params);
    
    // レガシー形式に変換
    return {
      isValid: result.isValid,
      errors: result.errors.map(e => e.message),
      metadata: {
        fileSize: result.statistics.fileSize,
        rowCount: result.statistics.totalRows,
        columnCount: Object.keys(result.statistics.columnStats).length,
        processingTime: result.statistics.processingTimeMs
      }
    };
  }
}

/**
 * バリデーション品質分析結果型定義
 */
export interface ValidationQualityAnalysis {
  qualityScore: number;                    // 品質スコア（0-100）
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F'; // 品質グレード
  dataCompleteness: number;                // データ完整性（%）
  errorRate: number;                       // エラー率（%）
  warningRate: number;                     // 警告率（%）
  errorTypeAnalysis: Record<string, number>; // エラータイプ別分析
  recommendations: string[];                // 推奨事項
}