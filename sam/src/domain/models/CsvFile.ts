import { z } from 'zod';

/**
 * CSVファイルドメインモデル
 * CSVファイルの属性と基本的なビジネスロジックを管理
 */
export class CsvFile {
  public readonly bucketName: string;
  public readonly objectKey: string;
  public readonly content: string;
  public readonly uploadTime: Date;
  public readonly fileSize: number;

  constructor(props: {
    bucketName: string;
    objectKey: string;
    content: string;
    uploadTime: Date;
  }) {
    // バリデーション
    const schema = z.object({
      bucketName: z.string().min(1, 'Bucket name is required'),
      objectKey: z.string().min(1, 'Object key is required'),
      content: z.string(),
      uploadTime: z.date()
    });

    const validated = schema.parse(props);

    this.bucketName = validated.bucketName;
    this.objectKey = validated.objectKey;
    this.content = validated.content;
    this.uploadTime = validated.uploadTime;
    this.fileSize = Buffer.byteLength(this.content, 'utf8');
  }

  /**
   * ファイル名を取得
   */
  get fileName(): string {
    const parts = this.objectKey.split('/');
    return parts[parts.length - 1] || '';
  }

  /**
   * ファイル拡張子を取得
   */
  get fileExtension(): string {
    const fileName = this.fileName;
    const lastDot = fileName.lastIndexOf('.');
    return lastDot > 0 ? fileName.substring(lastDot + 1).toLowerCase() : '';
  }

  /**
   * CSVファイルかどうかチェック
   */
  get isCsvFile(): boolean {
    return this.fileExtension === 'csv';
  }

  /**
   * CSVヘッダー行を取得
   */
  getHeaders(): string[] {
    if (!this.content.trim()) {
      return [];
    }

    const firstLine = this.content.split('\n')[0];
    return firstLine ? firstLine.split(',').map(header => header.trim()) : [];
  }

  /**
   * CSVデータ行数を取得（ヘッダー除く）
   */
  getDataRowCount(): number {
    const lines = this.content.split('\n').filter(line => line.trim() !== '');
    return Math.max(0, lines.length - 1); // ヘッダー行を除く
  }

  /**
   * ファイルの基本情報を取得
   */
  getMetadata(): {
    bucketName: string;
    objectKey: string;
    fileName: string;
    fileSize: number;
    uploadTime: Date;
    headerCount: number;
    dataRowCount: number;
  } {
    return {
      bucketName: this.bucketName,
      objectKey: this.objectKey,
      fileName: this.fileName,
      fileSize: this.fileSize,
      uploadTime: this.uploadTime,
      headerCount: this.getHeaders().length,
      dataRowCount: this.getDataRowCount()
    };
  }

  /**
   * ファイルサイズが制限内かチェック
   * @param maxSizeBytes 最大サイズ（バイト）
   */
  isWithinSizeLimit(maxSizeBytes: number): boolean {
    return this.fileSize <= maxSizeBytes;
  }

  /**
   * 空のファイルかチェック
   */
  get isEmpty(): boolean {
    return this.content.trim() === '';
  }
}