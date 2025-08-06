import { Pool, PoolClient } from 'pg';
import { Logger } from '@aws-lambda-powertools/logger';
import { User, UserStatistics } from '../../domain/models/User';
import { IUserRepository } from '../../domain/interfaces/IUserRepository';

const logger = new Logger({ serviceName: 'RdsUserRepository' });

/**
 * Aurora PostgreSQL ユーザーリポジトリ（インフラストラクチャ層）
 * IUserRepositoryインターフェースの実装
 * Aurora PostgreSQLスキーマ準拠（users + user_statistics テーブル）
 */
export class RdsUserRepository implements IUserRepository {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.AURORA_HOST || process.env.RDS_HOST || 'localhost',
      port: parseInt(process.env.AURORA_PORT || process.env.RDS_PORT || '5432'),
      database: process.env.AURORA_DATABASE || process.env.RDS_DATABASE || 'csv_processing',
      user: process.env.AURORA_USER || process.env.RDS_USER || 'postgres',
      password: process.env.AURORA_PASSWORD || process.env.RDS_PASSWORD || 'postgres123',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20, // コネクションプール最大接続数
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000, // チャンク処理用に少し長めに設定
      acquireTimeoutMillis: 60000,
      statement_timeout: 30000, // 30秒クエリタイムアウト
    });
  }

  /**
   * ユーザーIDでユーザーと統計情報を取得
   * @param userId ユーザーID
   * @returns ユーザー情報（存在しない場合はnull）
   */
  async findById(userId: string): Promise<User | null> {
    logger.debug('Finding user by ID', { userId });

    const client = await this.pool.connect();
    
    try {
      // users テーブルと user_statistics テーブルを JOIN
      const query = `
        SELECT 
          u.user_id,
          u.username,
          u.email,
          u.created_at,
          u.updated_at,
          u.is_active,
          u.metadata,
          COALESCE(us.login_count, 0) as login_count,
          COALESCE(us.post_count, 0) as post_count,
          us.last_login_date,
          us.last_post_date,
          us.last_updated as stats_last_updated
        FROM users u
        LEFT JOIN user_statistics us ON u.user_id = us.user_id
        WHERE u.user_id = $1 AND u.is_active = TRUE
      `;
      
      const result = await client.query(query, [userId]);
      
      if (result.rows.length === 0) {
        logger.debug('User not found', { userId });
        return null;
      }
      
      const row = result.rows[0];
      
      // UserStatistics ドメインモデル作成
      const statistics = new UserStatistics(
        row.login_count,
        row.post_count
      );
      
      // User ドメインモデル作成
      const user = new User(
        row.user_id,
        row.username,
        row.email,
        statistics,
        new Date(row.created_at),
        new Date(row.updated_at)
      );
      
      logger.debug('Successfully found user with statistics', { 
        userId,
        loginCount: statistics.loginCount,
        postCount: statistics.postCount
      });
      
      return user;

    } catch (error) {
      logger.error('Failed to find user by ID', { 
        userId, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 複数ユーザーを一括取得
   * @param userIds ユーザーID配列
   * @returns ユーザー情報配列
   */
  async findByIds(userIds: string[]): Promise<User[]> {
    logger.info('Finding users by IDs', { userIds, userCount: userIds.length });

    if (userIds.length === 0) {
      return [];
    }

    const client = await this.pool.connect();
    
    try {
      const placeholders = userIds.map((_, index) => `$${index + 1}`).join(', ');
      const query = `
        SELECT user_id, email, username, status, created_at, updated_at
        FROM users 
        WHERE user_id IN (${placeholders})
        ORDER BY created_at DESC
      `;
      
      const result = await client.query(query, userIds);
      
      const users = result.rows.map(row => new User(
        row.user_id,
        row.email,
        row.username,
        row.status,
        row.created_at,
        row.updated_at
      ));
      
      logger.info('Successfully found users by IDs', { 
        requestedCount: userIds.length,
        foundCount: users.length
      });
      
      return users;

    } catch (error) {
      logger.error('Failed to find users by IDs', { userIds, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * ユーザーを保存
   * @param user ユーザーオブジェクト
   */
  async save(user: User): Promise<void> {
    logger.info('Saving user', { userId: user.userId, email: user.email });

    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO users (user_id, email, username, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;
      
      await client.query(query, [
        user.userId,
        user.email,
        user.username,
        user.status,
        user.createdAt,
        user.updatedAt
      ]);
      
      logger.info('Successfully saved user', { userId: user.userId });

    } catch (error) {
      logger.error('Failed to save user', { userId: user.userId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * ユーザー情報と統計情報を更新（トランザクション）
   * @param user 更新するユーザーオブジェクト
   */
  async update(user: User): Promise<void> {
    logger.debug('Updating user with statistics', { 
      userId: user.id, 
      loginCount: user.statistics.loginCount,
      postCount: user.statistics.postCount
    });

    const client = await this.pool.connect();
    
    try {
      // トランザクション開始
      await client.query('BEGIN');
      
      // users テーブル更新
      const updateUserQuery = `
        UPDATE users 
        SET username = $2, email = $3, updated_at = $4
        WHERE user_id = $1 AND is_active = TRUE
      `;
      
      const userResult = await client.query(updateUserQuery, [
        user.id,
        user.username,
        user.email,
        user.updatedAt
      ]);
      
      if (userResult.rowCount === 0) {
        throw new Error(`User not found or inactive: ${user.id}`);
      }
      
      // user_statistics テーブル更新（UPSERT）
      const upsertStatsQuery = `
        INSERT INTO user_statistics (
          user_id, 
          login_count, 
          post_count, 
          last_updated,
          last_login_date,
          last_post_date
        )
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 
                CASE WHEN $2 > 0 THEN CURRENT_TIMESTAMP ELSE NULL END,
                CASE WHEN $3 > 0 THEN CURRENT_TIMESTAMP ELSE NULL END)
        ON CONFLICT (user_id) 
        DO UPDATE SET
          login_count = EXCLUDED.login_count,
          post_count = EXCLUDED.post_count,
          last_updated = CURRENT_TIMESTAMP,
          last_login_date = CASE 
            WHEN EXCLUDED.login_count > user_statistics.login_count 
            THEN CURRENT_TIMESTAMP 
            ELSE user_statistics.last_login_date 
          END,
          last_post_date = CASE 
            WHEN EXCLUDED.post_count > user_statistics.post_count 
            THEN CURRENT_TIMESTAMP 
            ELSE user_statistics.last_post_date 
          END
      `;
      
      await client.query(upsertStatsQuery, [
        user.id,
        user.statistics.loginCount,
        user.statistics.postCount
      ]);
      
      // トランザクションコミット
      await client.query('COMMIT');
      
      logger.debug('Successfully updated user with statistics', { 
        userId: user.id,
        loginCount: user.statistics.loginCount,
        postCount: user.statistics.postCount
      });

    } catch (error) {
      // ロールバック
      await client.query('ROLLBACK');
      logger.error('Failed to update user with statistics', { 
        userId: user.id, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 複数ユーザー統計を一括更新（バッチ処理最適化）
   * Aurora PostgreSQLストアドプロシージャを使用
   * @param users 更新するユーザーオブジェクト配列
   * @param executionId 実行ID（監査用）
   */
  async batchUpdate(users: User[], executionId?: string): Promise<void> {
    logger.info('Batch updating user statistics', { userCount: users.length, executionId });

    if (users.length === 0) {
      return;
    }

    const client = await this.pool.connect();
    
    try {
      // ストアドプロシージャ用のJSONデータ準備
      const userUpdates = users.map(user => ({
        user_id: user.id,
        login_increment: user.statistics.loginCount,
        post_increment: user.statistics.postCount,
        execution_id: executionId || 'batch-update'
      }));

      // Aurora PostgreSQLストアドプロシージャ呼び出し
      const query = `SELECT batch_update_user_statistics($1::jsonb)`;
      
      await client.query(query, [JSON.stringify(userUpdates)]);
      
      logger.info('Successfully batch updated user statistics', { 
        userCount: users.length,
        executionId
      });

    } catch (error) {
      logger.error('Failed to batch update user statistics', { 
        userCount: users.length, 
        executionId,
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 個別ユーザー統計更新（ストアドプロシージャ使用）
   * @param userId ユーザーID
   * @param loginIncrement ログイン回数増分
   * @param postIncrement 投稿回数増分
   * @param executionId 実行ID
   */
  async updateUserStatistics(
    userId: string,
    loginIncrement: number,
    postIncrement: number,
    executionId?: string
  ): Promise<void> {
    logger.debug('Updating user statistics via stored procedure', {
      userId,
      loginIncrement,
      postIncrement,
      executionId
    });

    const client = await this.pool.connect();

    try {
      const query = `
        SELECT update_user_statistics(
          $1::varchar,
          $2::bigint,
          $3::bigint,
          $4::varchar
        )
      `;

      await client.query(query, [
        userId,
        loginIncrement,
        postIncrement,
        executionId || 'individual-update'
      ]);

      logger.debug('Successfully updated user statistics', {
        userId,
        loginIncrement,
        postIncrement
      });

    } catch (error) {
      logger.error('Failed to update user statistics', {
        userId,
        loginIncrement,
        postIncrement,
        executionId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * ユーザーの存在確認
   * @param userId ユーザーID
   * @returns 存在フラグ
   */
  async exists(userId: string): Promise<boolean> {
    logger.info('Checking user existence', { userId });

    const client = await this.pool.connect();
    
    try {
      const query = 'SELECT 1 FROM users WHERE user_id = $1';
      const result = await client.query(query, [userId]);
      
      const exists = result.rows.length > 0;
      logger.info('User existence check result', { userId, exists });
      
      return exists;

    } catch (error) {
      logger.error('Failed to check user existence', { userId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 条件に合致するユーザー数をカウント
   * @param condition 検索条件
   * @returns ユーザー数
   */
  async count(condition?: Record<string, any>): Promise<number> {
    logger.info('Counting users', { condition });

    const client = await this.pool.connect();
    
    try {
      let query = 'SELECT COUNT(*) FROM users';
      const values: any[] = [];
      
      if (condition && Object.keys(condition).length > 0) {
        const whereConditions: string[] = [];
        let paramIndex = 1;
        
        for (const [key, value] of Object.entries(condition)) {
          whereConditions.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
        
        query += ` WHERE ${whereConditions.join(' AND ')}`;
      }
      
      const result = await client.query(query, values);
      const count = parseInt(result.rows[0].count, 10);
      
      logger.info('Successfully counted users', { count, condition });
      
      return count;

    } catch (error) {
      logger.error('Failed to count users', { condition, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 処理実行完了情報をAurora PostgreSQLに保存
   * ストアドプロシージャを使用した効率的な更新
   * @param executionId 実行ID
   * @param status 実行ステータス
   * @param totalRecords 総レコード数
   * @param successRecords 成功レコード数
   * @param errorRecords エラーレコード数
   * @param executionOutput 実行出力（JSON文字列）
   * @param errorDetails エラー詳細（JSON文字列）
   */
  async completeProcessingExecution(
    executionId: string,
    status: string,
    totalRecords: number,
    successRecords: number,
    errorRecords: number,
    executionOutput?: string,
    errorDetails?: string
  ): Promise<void> {
    this.logger.info('Completing processing execution', {
      executionId,
      status,
      totalRecords,
      successRecords,
      errorRecords
    });

    const client = await this.pool.connect();

    try {
      // Aurora PostgreSQL ストアドプロシージャ呼び出し
      const query = `
        SELECT complete_processing_execution(
          $1::varchar,
          $2::varchar,
          $3::integer,
          $4::integer,
          $5::integer,
          $6::jsonb,
          $7::jsonb
        )
      `;

      await client.query(query, [
        executionId,
        status,
        totalRecords,
        successRecords,
        errorRecords,
        executionOutput ? JSON.parse(executionOutput) : null,
        errorDetails ? JSON.parse(errorDetails) : null
      ]);

      this.logger.info('Processing execution completed successfully', {
        executionId,
        status,
        successRate: totalRecords > 0 ? Math.round((successRecords / totalRecords) * 100) : 0
      });

    } catch (error) {
      this.logger.error('Failed to complete processing execution', {
        executionId,
        status,
        totalRecords,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      client.release();
    }
  }
}