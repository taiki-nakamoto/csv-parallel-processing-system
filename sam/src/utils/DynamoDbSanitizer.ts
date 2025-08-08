import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: 'dynamodb-sanitizer' });

/**
 * DynamoDB保存前のオブジェクト安全化ユーティリティ
 * Date型オブジェクトを再帰的にISO文字列に変換し、DynamoDBマーシャリングエラーを防ぐ
 */
export class DynamoDbSanitizer {
  
  /**
   * オブジェクトを再帰的にサニタイズしてDynamoDB保存可能な形式に変換
   * @param obj サニタイズ対象のオブジェクト
   * @param depth 再帰深度制限（無限ループ防止）
   * @param removeUndefined undefined値を除去するかどうか
   * @returns サニタイズされたオブジェクト
   */
  static sanitizeObject(obj: any, depth: number = 0, removeUndefined: boolean = true): any {
    // 再帰深度制限（循環参照対策）
    if (depth > 10) {
      logger.warn('DynamoDB sanitize depth limit reached', { depth });
      return '[MAX_DEPTH_EXCEEDED]';
    }

    // null, undefined, プリミティブ型はそのまま返す
    if (obj === null) {
      return obj;
    }
    
    // undefined値の処理（removeUndefined=trueの場合は除去）
    if (obj === undefined) {
      return removeUndefined ? undefined : obj;
    }

    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    // Date型の場合はISO文字列に変換
    if (obj instanceof Date) {
      const isoString = obj.toISOString();
      logger.debug('Date object converted to ISO string', { 
        original: obj.toString(),
        converted: isoString
      });
      return isoString;
    }

    // 配列の場合は各要素を再帰的にサニタイズ
    if (Array.isArray(obj)) {
      const sanitizedArray = obj.map((item, index) => {
        try {
          return this.sanitizeObject(item, depth + 1, removeUndefined);
        } catch (error) {
          logger.error('Failed to sanitize array item', {
            index,
            error: error instanceof Error ? error.message : String(error)
          });
          return `[SANITIZE_ERROR_${index}]`;
        }
      });
      
      // undefined要素を除去（removeUndefined=trueの場合）
      return removeUndefined ? sanitizedArray.filter(item => item !== undefined) : sanitizedArray;
    }

    // オブジェクトの場合は各プロパティを再帰的にサニタイズ
    if (typeof obj === 'object') {
      const sanitized: Record<string, any> = {};
      
      for (const [key, value] of Object.entries(obj)) {
        try {
          const sanitizedValue = this.sanitizeObject(value, depth + 1, removeUndefined);
          
          // undefined値を除去（removeUndefined=trueの場合）
          if (removeUndefined && sanitizedValue === undefined) {
            continue; // プロパティを追加しない
          }
          
          sanitized[key] = sanitizedValue;
        } catch (error) {
          logger.error('Failed to sanitize object property', {
            key,
            error: error instanceof Error ? error.message : String(error)
          });
          sanitized[key] = `[SANITIZE_ERROR_${key}]`;
        }
      }
      
      return sanitized;
    }

    // その他の型（function, symbol等）は文字列に変換
    logger.warn('Unsupported type converted to string', {
      type: typeof obj,
      constructor: obj.constructor?.name
    });
    return String(obj);
  }

  /**
   * DynamoDB Item形式のオブジェクトを安全化
   * 一般的なDynamoDB保存パターン用の便利メソッド
   * @param item DynamoDB Item
   * @returns サニタイズされたItem
   */
  static sanitizeDynamoDbItem(item: Record<string, any>): Record<string, any> {
    logger.debug('Sanitizing DynamoDB item', {
      keys: Object.keys(item),
      originalItemType: typeof item
    });

    const sanitized = this.sanitizeObject(item);
    
    logger.debug('DynamoDB item sanitization completed', {
      originalKeys: Object.keys(item),
      sanitizedKeys: Object.keys(sanitized)
    });

    return sanitized;
  }

  /**
   * AuditLog専用のサニタイズメソッド
   * AuditLogオブジェクトの特殊な構造に対応
   * @param auditLogData AuditLog用データ
   * @returns サニタイズされたデータ
   */
  static sanitizeAuditLogData(auditLogData: any): any {
    logger.debug('Sanitizing audit log data');

    // メタデータフィールドの特別処理
    if (auditLogData.metadata && typeof auditLogData.metadata === 'object') {
      auditLogData.metadata = this.sanitizeObject(auditLogData.metadata);
    }

    // 全体をサニタイズ
    return this.sanitizeObject(auditLogData);
  }

  /**
   * ProcessingMetadata専用のサニタイズメソッド
   * ProcessingMetadataオブジェクトの特殊な構造に対応
   * @param metadata ProcessingMetadata用データ
   * @returns サニタイズされたデータ
   */
  static sanitizeProcessingMetadata(metadata: any): any {
    logger.debug('Sanitizing processing metadata');

    // metadataフィールド内のネストしたオブジェクトを特別処理
    if (metadata.metadata && typeof metadata.metadata === 'object') {
      metadata.metadata = this.sanitizeObject(metadata.metadata);
    }

    // 全体をサニタイズ
    return this.sanitizeObject(metadata);
  }

  /**
   * Date型オブジェクトの検出・ログ出力
   * デバッグ用メソッド
   * @param obj チェック対象のオブジェクト
   * @param path オブジェクトパス（デバッグ用）
   */
  static detectDateObjects(obj: any, path: string = 'root'): void {
    if (obj === null || obj === undefined) {
      return;
    }

    if (obj instanceof Date) {
      logger.warn('Date object detected', { 
        path, 
        value: obj.toString(),
        isoValue: obj.toISOString()
      });
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        this.detectDateObjects(item, `${path}[${index}]`);
      });
      return;
    }

    if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        this.detectDateObjects(value, `${path}.${key}`);
      }
    }
  }
}