import { Logger } from '@aws-lambda-powertools/logger';

// Domain Interfaces
import { IUserRepository } from '@domain/interfaces/IUserRepository';
import { IS3Repository } from '@domain/interfaces/IS3Repository';
import { IAuditLogRepository } from '@domain/interfaces/IAuditLogRepository';
import { IProcessingMetadataRepository } from '@domain/interfaces/IProcessingMetadataRepository';

// Infrastructure Implementations
import { RdsUserRepository } from '@infrastructure/repositories/RdsUserRepository';
import { S3CsvRepository } from '@infrastructure/repositories/S3CsvRepository';
import { DynamoDbAuditRepository } from '@infrastructure/repositories/DynamoDbAuditRepository';
import { DynamoDbProcessingMetadataRepository } from '@infrastructure/repositories/DynamoDbProcessingMetadataRepository';

// Application Services
import { ChunkProcessingService } from '../../application/services/ChunkProcessingService';
import { ResultAggregationService } from '../../application/services/ResultAggregationService';
import { AuditLoggingService } from '../../application/services/AuditLoggingService';
import { ErrorHandlingService } from '../../application/services/ErrorHandlingService';

// Domain Services
import { ChunkProcessor } from '../../domain/services/ChunkProcessor';
import { ResultAggregator } from '../../domain/services/ResultAggregator';

// Infrastructure Repositories
import { ResultRepository } from '../repositories/ResultRepository';

const logger = new Logger({ serviceName: 'di-container' });

/**
 * 依存性注入コンテナ
 * クリーンアーキテクチャのDIP（依存関係逆転の原則）を実現
 */
export class DIContainer {
  private static instance: DIContainer;
  
  // Repository instances
  private _userRepository: IUserRepository | null = null;
  private _s3Repository: IS3Repository | null = null;
  private _auditLogRepository: IAuditLogRepository | null = null;
  private _processingMetadataRepository: IProcessingMetadataRepository | null = null;
  
  // Service instances
  private _chunkProcessingService: ChunkProcessingService | null = null;
  private _chunkProcessor: ChunkProcessor | null = null;
  private _resultAggregationService: ResultAggregationService | null = null;
  private _resultAggregator: ResultAggregator | null = null;
  private _resultRepository: ResultRepository | null = null;
  private _auditLoggingService: AuditLoggingService | null = null;
  private _errorHandlingService: ErrorHandlingService | null = null;

  /**
   * シングルトンパターンでインスタンスを取得
   */
  public static getInstance(): DIContainer {
    if (!DIContainer.instance) {
      DIContainer.instance = new DIContainer();
      logger.info('DIContainer instance created');
    }
    return DIContainer.instance;
  }

  /**
   * プライベートコンストラクタ（シングルトンパターン）
   */
  private constructor() {
    logger.info('Initializing DIContainer');
  }

  /**
   * ユーザーリポジトリを取得
   * @returns IUserRepository実装
   */
  public getUserRepository(): IUserRepository {
    if (!this._userRepository) {
      this._userRepository = new RdsUserRepository();
      logger.info('UserRepository instance created');
    }
    return this._userRepository;
  }

  /**
   * S3リポジトリを取得
   * @returns IS3Repository実装
   */
  public getS3Repository(): IS3Repository {
    if (!this._s3Repository) {
      this._s3Repository = new S3CsvRepository();
      logger.info('S3Repository instance created');
    }
    return this._s3Repository;
  }

  /**
   * 監査ログリポジトリを取得
   * @returns IAuditLogRepository実装
   */
  public getAuditLogRepository(): IAuditLogRepository {
    if (!this._auditLogRepository) {
      this._auditLogRepository = new DynamoDbAuditRepository();
      logger.info('AuditLogRepository instance created');
    }
    return this._auditLogRepository;
  }

  /**
   * 処理メタデータリポジトリを取得
   * @returns IProcessingMetadataRepository実装
   */
  public getProcessingMetadataRepository(): IProcessingMetadataRepository {
    if (!this._processingMetadataRepository) {
      this._processingMetadataRepository = new DynamoDbProcessingMetadataRepository();
      logger.info('ProcessingMetadataRepository instance created');
    }
    return this._processingMetadataRepository;
  }

  /**
   * チャンクプロセッサー（ドメインサービス）を取得
   * @returns ChunkProcessor実装
   */
  public getChunkProcessor(): ChunkProcessor {
    if (!this._chunkProcessor) {
      this._chunkProcessor = new ChunkProcessor();
      logger.info('ChunkProcessor instance created');
    }
    return this._chunkProcessor;
  }

  /**
   * チャンク処理サービス（アプリケーションサービス）を取得
   * @returns ChunkProcessingService実装
   */
  public getChunkProcessingService(): ChunkProcessingService {
    if (!this._chunkProcessingService) {
      // 依存性を注入してサービスを作成
      const userRepository = this.getUserRepository();
      const auditLogRepository = this.getAuditLogRepository();
      const chunkProcessor = this.getChunkProcessor();
      
      this._chunkProcessingService = new ChunkProcessingService(
        userRepository,
        auditLogRepository,
        chunkProcessor
      );
      logger.info('ChunkProcessingService instance created');
    }
    return this._chunkProcessingService;
  }

  /**
   * ResultAggregator（ドメインサービス）を取得
   * @returns ResultAggregator実装
   */
  public getResultAggregator(): ResultAggregator {
    if (!this._resultAggregator) {
      this._resultAggregator = new ResultAggregator();
      logger.info('ResultAggregator instance created');
    }
    return this._resultAggregator;
  }

  /**
   * ResultRepository（インフラストラクチャリポジトリ）を取得
   * @returns ResultRepository実装
   */
  public getResultRepository(): ResultRepository {
    if (!this._resultRepository) {
      this._resultRepository = new ResultRepository();
      logger.info('ResultRepository instance created');
    }
    return this._resultRepository;
  }

  /**
   * 結果集約サービス（アプリケーションサービス）を取得
   * @returns ResultAggregationService実装
   */
  public getResultAggregationService(): ResultAggregationService {
    if (!this._resultAggregationService) {
      // 依存性を注入してサービスを作成
      const resultAggregator = this.getResultAggregator();
      const resultRepository = this.getResultRepository();
      const auditLogRepository = this.getAuditLogRepository();
      
      this._resultAggregationService = new ResultAggregationService(
        resultAggregator,
        resultRepository,
        auditLogRepository
      );
      logger.info('ResultAggregationService instance created');
    }
    return this._resultAggregationService;
  }

  /**
   * 監査ログサービス（アプリケーションサービス）を取得
   * @returns AuditLoggingService実装
   */
  public getAuditLoggingService(): AuditLoggingService {
    if (!this._auditLoggingService) {
      // 依存性を注入してサービスを作成
      const auditLogRepository = this.getAuditLogRepository();
      const processingMetadataRepository = this.getProcessingMetadataRepository();
      
      this._auditLoggingService = new AuditLoggingService(
        auditLogRepository,
        processingMetadataRepository
      );
      logger.info('AuditLoggingService instance created');
    }
    return this._auditLoggingService;
  }

  /**
   * エラーハンドリングサービス（アプリケーションサービス）を取得
   * @returns ErrorHandlingService実装
   */
  public getErrorHandlingService(): ErrorHandlingService {
    if (!this._errorHandlingService) {
      // 依存性を注入してサービスを作成
      const auditLogRepository = this.getAuditLogRepository();
      const processingMetadataRepository = this.getProcessingMetadataRepository();
      
      this._errorHandlingService = new ErrorHandlingService(
        auditLogRepository,
        processingMetadataRepository
      );
      logger.info('ErrorHandlingService instance created');
    }
    return this._errorHandlingService;
  }

  /**
   * テスト用：リポジトリのモック設定
   * テスト時にモックオブジェクトを注入するために使用
   */
  public setUserRepository(repository: IUserRepository): void {
    this._userRepository = repository;
    logger.info('UserRepository mock injected for testing');
  }

  public setS3Repository(repository: IS3Repository): void {
    this._s3Repository = repository;
    logger.info('S3Repository mock injected for testing');
  }

  public setAuditLogRepository(repository: IAuditLogRepository): void {
    this._auditLogRepository = repository;
    logger.info('AuditLogRepository mock injected for testing');
  }

  public setProcessingMetadataRepository(repository: IProcessingMetadataRepository): void {
    this._processingMetadataRepository = repository;
    logger.info('ProcessingMetadataRepository mock injected for testing');
  }

  /**
   * テスト用：全てのインスタンスをクリア
   */
  public clearForTesting(): void {
    this._userRepository = null;
    this._s3Repository = null;
    this._auditLogRepository = null;
    this._processingMetadataRepository = null;
    this._chunkProcessingService = null;
    this._resultAggregationService = null;
    this._auditLoggingService = null;
    this._errorHandlingService = null;
    logger.info('All instances cleared for testing');
  }

  /**
   * コンテナの健全性チェック
   * 必要な依存関係が正しく設定されているかを確認
   */
  public healthCheck(): {
    status: 'healthy' | 'unhealthy';
    details: Record<string, boolean>;
  } {
    const details = {
      userRepository: this._userRepository !== null,
      s3Repository: this._s3Repository !== null,
      auditLogRepository: this._auditLogRepository !== null,
      processingMetadataRepository: this._processingMetadataRepository !== null
    };

    const allHealthy = Object.values(details).every(v => v === true);
    const status = allHealthy ? 'healthy' : 'unhealthy';

    logger.info('DIContainer health check completed', { status, details });

    return { status, details };
  }

  /**
   * コンテナから特定のサービスを取得
   * @param serviceName サービス名
   * @returns サービスインスタンス
   */
  public get<T>(serviceName: string): T {
    switch (serviceName) {
      case 'ChunkProcessingService':
        return this.getChunkProcessingService() as T;
      case 'ResultAggregationService':
        return this.getResultAggregationService() as T;
      case 'AuditLoggingService':
        return this.getAuditLoggingService() as T;
      case 'ErrorHandlingService':
        return this.getErrorHandlingService() as T;
      default:
        throw new Error(`Service '${serviceName}' not found`);
    }
  }

  /**
   * 環境情報の取得
   * デバッグ用に現在の環境設定を返す
   */
  public getEnvironmentInfo(): Record<string, string> {
    return {
      NODE_ENV: process.env.NODE_ENV || 'development',
      AWS_REGION: process.env.AWS_REGION || 'ap-northeast-1',
      RDS_HOST: process.env.RDS_HOST || 'localhost',
      DYNAMODB_AUDIT_TABLE: process.env.DYNAMODB_AUDIT_TABLE || 'csv-parallel-processing-audit-logs-dev',
      DYNAMODB_PROCESSING_METADATA_TABLE: process.env.DYNAMODB_PROCESSING_METADATA_TABLE || 'csv-parallel-processing-metadata-dev'
    };
  }
}