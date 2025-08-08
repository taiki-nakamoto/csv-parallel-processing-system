import { User } from '@domain/models/User';

/**
 * ユーザーリポジトリインターフェース（Domain層）
 * ユーザーデータの永続化操作を定義
 */
export interface IUserRepository {
  /**
   * ユーザーIDでユーザーを取得
   * @param userId ユーザーID
   * @returns ユーザー情報（存在しない場合はnull）
   */
  findById(userId: string): Promise<User | null>;

  /**
   * 複数ユーザーを一括取得
   * @param userIds ユーザーID配列
   * @returns ユーザー情報配列
   */
  findByIds(userIds: string[]): Promise<User[]>;

  /**
   * ユーザーを保存
   * @param user ユーザーオブジェクト
   */
  save(user: User): Promise<void>;

  /**
   * ユーザー情報を更新
   * @param user 更新するユーザーオブジェクト
   */
  update(user: User): Promise<void>;

  /**
   * 複数ユーザーを一括更新
   * @param users 更新するユーザーオブジェクト配列
   */
  batchUpdate(users: User[]): Promise<void>;

  /**
   * ユーザーの存在確認
   * @param userId ユーザーID
   * @returns 存在フラグ
   */
  exists(userId: string): Promise<boolean>;

  /**
   * 条件に合致するユーザー数をカウント
   * @param condition 検索条件
   * @returns ユーザー数
   */
  count(condition?: Record<string, any>): Promise<number>;
}