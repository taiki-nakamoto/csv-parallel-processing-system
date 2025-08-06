import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: 'user-model' });

/**
 * ユーザードメインモデル
 * ユーザー情報とビジネスロジックを含む
 */
export class User {
  public readonly userId: string;
  public readonly email: string;
  public readonly username: string;
  public readonly status: UserStatus;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(
    userId: string,
    email: string,
    username: string,
    status: UserStatus = UserStatus.ACTIVE,
    createdAt?: Date,
    updatedAt?: Date
  ) {
    // バリデーション
    this.validateUserId(userId);
    this.validateEmail(email);
    this.validateUsername(username);

    this.userId = userId;
    this.email = email;
    this.username = username;
    this.status = status;
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();

    logger.debug('User model created', { 
      userId: this.userId,
      email: this.email,
      status: this.status
    });
  }

  /**
   * 新しいユーザーを作成（ファクトリーメソッド）
   * @param userId ユーザーID
   * @param email メールアドレス
   * @param username ユーザー名
   * @returns User instance
   */
  static create(userId: string, email: string, username: string): User {
    return new User(userId, email, username, UserStatus.ACTIVE);
  }

  /**
   * データベースレコードからUserモデルを復元
   * @param dbRecord データベースレコード
   * @returns User instance
   */
  static fromDatabaseRecord(dbRecord: any): User {
    return new User(
      dbRecord.user_id,
      dbRecord.email,
      dbRecord.username,
      dbRecord.status as UserStatus,
      new Date(dbRecord.created_at),
      new Date(dbRecord.updated_at)
    );
  }

  /**
   * ユーザーがアクティブかチェック
   * @returns アクティブフラグ
   */
  public isActive(): boolean {
    return this.status === UserStatus.ACTIVE;
  }

  /**
   * ユーザーが削除済みかチェック
   * @returns 削除フラグ
   */
  public isDeleted(): boolean {
    return this.status === UserStatus.DELETED;
  }

  /**
   * ユーザーが一時停止中かチェック
   * @returns 一時停止フラグ
   */
  public isSuspended(): boolean {
    return this.status === UserStatus.SUSPENDED;
  }

  /**
   * ユーザー情報を更新（新しいインスタンスを返す）
   * @param updates 更新する情報
   * @returns 新しいUserインスタンス
   */
  public update(updates: {
    email?: string;
    username?: string;
    status?: UserStatus;
  }): User {
    return new User(
      this.userId,
      updates.email || this.email,
      updates.username || this.username,
      updates.status || this.status,
      this.createdAt,
      new Date() // 更新時刻を現在時刻に設定
    );
  }

  /**
   * ユーザーを一時停止
   * @returns 一時停止されたユーザーインスタンス
   */
  public suspend(): User {
    if (this.status === UserStatus.DELETED) {
      throw new Error('Cannot suspend deleted user');
    }
    return this.update({ status: UserStatus.SUSPENDED });
  }

  /**
   * ユーザーをアクティブ化
   * @returns アクティブ化されたユーザーインスタンス
   */
  public activate(): User {
    if (this.status === UserStatus.DELETED) {
      throw new Error('Cannot activate deleted user');
    }
    return this.update({ status: UserStatus.ACTIVE });
  }

  /**
   * ユーザーを削除（論理削除）
   * @returns 削除されたユーザーインスタンス
   */
  public delete(): User {
    return this.update({ status: UserStatus.DELETED });
  }

  /**
   * データベース保存用の形式に変換
   * @returns データベース保存用オブジェクト
   */
  public toDatabaseRecord(): any {
    return {
      user_id: this.userId,
      email: this.email,
      username: this.username,
      status: this.status,
      created_at: this.createdAt,
      updated_at: this.updatedAt
    };
  }

  /**
   * API レスポンス用の形式に変換
   * @returns API レスポンス用オブジェクト
   */
  public toApiResponse(): any {
    return {
      userId: this.userId,
      email: this.email,
      username: this.username,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString()
    };
  }

  /**
   * ユーザーIDのバリデーション
   * @param userId ユーザーID
   */
  private validateUserId(userId: string): void {
    if (!userId || typeof userId !== 'string') {
      throw new Error('User ID is required and must be a string');
    }
    
    if (userId.length < 1 || userId.length > 100) {
      throw new Error('User ID must be between 1 and 100 characters');
    }
    
    // ユーザーIDの形式チェック（英数字、ハイフン、アンダースコアのみ）
    const userIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!userIdPattern.test(userId)) {
      throw new Error('User ID can only contain alphanumeric characters, hyphens, and underscores');
    }
  }

  /**
   * メールアドレスのバリデーション
   * @param email メールアドレス
   */
  private validateEmail(email: string): void {
    if (!email || typeof email !== 'string') {
      throw new Error('Email is required and must be a string');
    }
    
    if (email.length > 254) {
      throw new Error('Email must be 254 characters or less');
    }
    
    // 基本的なメールアドレスの形式チェック
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      throw new Error('Invalid email format');
    }
  }

  /**
   * ユーザー名のバリデーション
   * @param username ユーザー名
   */
  private validateUsername(username: string): void {
    if (!username || typeof username !== 'string') {
      throw new Error('Username is required and must be a string');
    }
    
    if (username.length < 1 || username.length > 50) {
      throw new Error('Username must be between 1 and 50 characters');
    }
    
    // 特殊文字のチェック（制御文字は除外）
    const usernamePattern = /^[^\x00-\x1F\x7F]+$/;
    if (!usernamePattern.test(username)) {
      throw new Error('Username contains invalid characters');
    }
  }

  /**
   * オブジェクトの等価性チェック
   * @param other 比較対象のユーザー
   * @returns 等価フラグ
   */
  public equals(other: User): boolean {
    return this.userId === other.userId;
  }

  /**
   * 文字列表現
   * @returns 文字列表現
   */
  public toString(): string {
    return `User(${this.userId}, ${this.email}, ${this.status})`;
  }
}

/**
 * ユーザーステータス列挙型
 */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED'
}