import { AuditLog } from '@domain/models/AuditLog';

/**
 * 監査ログリポジトリインターフェース（Domain層）
 * 監査ログの永続化操作を定義
 */
export interface IAuditLogRepository {
  /**
   * 監査ログを保存
   * @param auditLog 監査ログオブジェクト
   */
  saveAuditLog(auditLog: AuditLog): Promise<void>;

  /**
   * 複数の監査ログを一括保存
   * @param auditLogs 監査ログオブジェクト配列
   */
  batchSaveAuditLogs(auditLogs: AuditLog[]): Promise<void>;

  /**
   * 実行IDで監査ログを取得
   * @param executionId 実行ID
   * @returns 監査ログ配列
   */
  getAuditLogsByExecutionId(executionId: string): Promise<AuditLog[]>;

  /**
   * イベントタイプで監査ログを検索
   * @param eventType イベントタイプ
   * @param startTime 開始時間（オプション）
   * @param endTime 終了時間（オプション）
   * @param limit 取得件数制限（デフォルト100）
   * @returns 監査ログ配列
   */
  getAuditLogsByEventType(
    eventType: string,
    startTime?: Date,
    endTime?: Date,
    limit?: number
  ): Promise<AuditLog[]>;

  /**
   * ログレベルで監査ログを検索
   * @param logLevel ログレベル
   * @param startTime 開始時間（オプション）
   * @param endTime 終了時間（オプション）
   * @param limit 取得件数制限（デフォルト100）
   * @returns 監査ログ配列
   */
  getAuditLogsByLogLevel(
    logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
    startTime?: Date,
    endTime?: Date,
    limit?: number
  ): Promise<AuditLog[]>;

  /**
   * エラーログのみを取得
   * @param startTime 開始時間
   * @param endTime 終了時間
   * @param limit 取得件数制限（デフォルト100）
   * @returns エラーログ配列
   */
  getErrorLogs(startTime: Date, endTime: Date, limit?: number): Promise<AuditLog[]>;

  /**
   * 監査ログの統計情報を取得
   * @param startTime 開始時間
   * @param endTime 終了時間
   * @returns 統計情報
   */
  getAuditLogStatistics(startTime: Date, endTime: Date): Promise<{
    totalLogs: number;
    logsByLevel: Record<string, number>;
    logsByEventType: Record<string, number>;
  }>;

  /**
   * コリレーションIDで監査ログを取得
   * @param correlationId コリレーションID
   * @param limit 取得件数制限（デフォルト100）
   * @returns 監査ログ配列
   */
  getAuditLogsByCorrelationId(correlationId: string, limit?: number): Promise<AuditLog[]>;

  /**
   * ログ統計情報を取得（AuditLoggingServiceで使用）
   * @param eventType イベントタイプ（オプショナル）
   * @param startDate 開始日時
   * @param endDate 終了日時
   * @returns ログ統計情報
   */
  getLogStatistics(
    eventType: string | undefined,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalLogs: number;
    logsByLevel: Record<string, number>;
    logsByEventType: Record<string, number>;
  }>;

  /**
   * 古い監査ログを削除（TTL切れ）
   * @param cutoffDate 削除対象日付
   * @returns 削除件数
   */
  deleteExpiredAuditLogs(cutoffDate: Date): Promise<number>;
}