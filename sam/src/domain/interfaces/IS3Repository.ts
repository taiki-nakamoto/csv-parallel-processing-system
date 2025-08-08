/**
 * S3リポジトリインターフェース（Domain層）
 * S3ストレージの操作を定義
 */
export interface IS3Repository {
  /**
   * CSVファイルの内容を取得
   * @param bucketName S3バケット名
   * @param objectKey オブジェクトキー
   * @returns CSVファイルの内容
   */
  getCsvContent(bucketName: string, objectKey: string): Promise<string>;

  /**
   * CSVファイルを保存
   * @param bucketName S3バケット名
   * @param objectKey オブジェクトキー
   * @param content CSVファイルの内容
   * @param metadata メタデータ（オプション）
   */
  putCsvContent(
    bucketName: string, 
    objectKey: string, 
    content: string,
    metadata?: Record<string, string>
  ): Promise<void>;

  /**
   * CSVファイルが存在するかチェック
   * @param bucketName S3バケット名
   * @param objectKey オブジェクトキー
   * @returns ファイル存在フラグ
   */
  csvExists(bucketName: string, objectKey: string): Promise<boolean>;

  /**
   * CSVファイルのメタデータを取得
   * @param bucketName S3バケット名
   * @param objectKey オブジェクトキー
   * @returns ファイルメタデータ
   */
  getCsvMetadata(bucketName: string, objectKey: string): Promise<{
    contentLength: number;
    lastModified: Date;
    contentType: string;
    metadata: Record<string, string>;
  }>;

  /**
   * 処理結果ファイルを保存
   * @param bucketName S3バケット名
   * @param objectKey オブジェクトキー
   * @param content 処理結果の内容
   * @param contentType コンテンツタイプ（デフォルト: text/csv）
   */
  putProcessedFile(
    bucketName: string, 
    objectKey: string, 
    content: string,
    contentType?: string
  ): Promise<void>;

  /**
   * ファイルを削除
   * @param bucketName S3バケット名
   * @param objectKey オブジェクトキー
   */
  deleteFile(bucketName: string, objectKey: string): Promise<void>;

  /**
   * プレフィックスによるファイル一覧取得
   * @param bucketName S3バケット名
   * @param prefix プレフィックス
   * @param maxKeys 最大取得件数（デフォルト: 1000）
   * @returns ファイル情報配列
   */
  listFiles(bucketName: string, prefix: string, maxKeys?: number): Promise<{
    key: string;
    lastModified: Date;
    size: number;
  }[]>;
}