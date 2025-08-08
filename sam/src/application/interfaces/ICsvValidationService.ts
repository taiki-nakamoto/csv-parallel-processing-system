/**
 * CSVバリデーションサービスインターフェース
 * アプリケーション層のサービス契約を定義
 */
export interface ICsvValidationService {
  /**
   * CSVファイルのバリデーション
   * @param params バリデーション実行パラメータ
   * @returns バリデーション結果
   */
  validateCsvFile(params: {
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
  }>;
}