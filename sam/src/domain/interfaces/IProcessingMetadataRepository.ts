import { ProcessingMetadata } from '@domain/models/ProcessingMetadata';

/**
 * 処理メタデータリポジトリインターフェース（Domain層）
 * 処理状況・進捗管理データの永続化操作を定義
 */
export interface IProcessingMetadataRepository {
  /**
   * 処理メタデータを保存
   * @param metadata 処理メタデータオブジェクト
   */
  save(metadata: ProcessingMetadata): Promise<void>;

  /**
   * 処理メタデータを更新
   * @param metadata 更新する処理メタデータオブジェクト
   */
  update(metadata: ProcessingMetadata): Promise<void>;

  /**
   * 処理IDで処理メタデータを取得
   * @param processingId 処理ID
   * @returns 処理メタデータ（存在しない場合はnull）
   */
  findByProcessingId(processingId: string): Promise<ProcessingMetadata | null>;

  /**
   * ファイル名で処理メタデータを検索
   * @param fileName ファイル名
   * @param limit 取得件数制限（デフォルト10）
   * @returns 処理メタデータ配列
   */
  findByFileName(fileName: string, limit?: number): Promise<ProcessingMetadata[]>;

  /**
   * ステータスで処理メタデータを検索
   * @param status 処理ステータス
   * @param limit 取得件数制限（デフォルト100）
   * @returns 処理メタデータ配列
   */
  findByStatus(status: string, limit?: number): Promise<ProcessingMetadata[]>;

  /**
   * 処理中のメタデータを取得
   * @param limit 取得件数制限（デフォルト50）
   * @returns 処理中メタデータ配列
   */
  findProcessingItems(limit?: number): Promise<ProcessingMetadata[]>;

  /**
   * 完了した処理メタデータを取得
   * @param startTime 開始時間（オプション）
   * @param endTime 終了時間（オプション）
   * @param limit 取得件数制限（デフォルト100）
   * @returns 完了メタデータ配列
   */
  findCompletedItems(startTime?: Date, endTime?: Date, limit?: number): Promise<ProcessingMetadata[]>;

  /**
   * エラー発生した処理メタデータを取得
   * @param startTime 開始時間（オプション）
   * @param endTime 終了時間（オプション）
   * @param limit 取得件数制限（デフォルト100）
   * @returns エラーメタデータ配列
   */
  findErrorItems(startTime?: Date, endTime?: Date, limit?: number): Promise<ProcessingMetadata[]>;

  /**
   * 処理メタデータを削除
   * @param processingId 処理ID
   */
  delete(processingId: string): Promise<void>;

  /**
   * 古い完了済み処理メタデータを削除
   * @param cutoffDate 削除対象日付
   * @returns 削除件数
   */
  deleteCompletedItems(cutoffDate: Date): Promise<number>;

  /**
   * 処理統計を取得
   * @param startTime 開始時間
   * @param endTime 終了時間
   * @returns 処理統計
   */
  getProcessingStatistics(startTime: Date, endTime: Date): Promise<{
    totalProcessed: number;
    successCount: number;
    errorCount: number;
    averageProcessingTime: number;
    statusBreakdown: Record<string, number>;
  }>;
}