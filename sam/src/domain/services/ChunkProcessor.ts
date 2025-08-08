import { Logger } from '@aws-lambda-powertools/logger';
import { User, UserStatistics } from '../models/User';

/**
 * チャンクプロセッサー（ドメインサービス）
 * CSVレコードの解析、バリデーション、ドメインモデル変換を担当
 */
export class ChunkProcessor {
    private readonly logger = new Logger({ serviceName: 'ChunkProcessor' });

    /**
     * CSVレコードデータをユーザーログデータに変換
     * @param csvData CSVの1行分のデータ（カラム名：値のマップ）
     * @param itemIndex 処理中のアイテムインデックス
     * @returns パースされたユーザーログデータ
     */
    async processUserLogData(
        csvData: Record<string, string>,
        itemIndex: number
    ): Promise<UserLogData> {
        this.logger.debug('Processing CSV record to user log data', {
            itemIndex,
            userId: csvData['ユーザーID']
        });

        try {
            // CSVデータの基本バリデーション
            this.validateRequiredFields(csvData, itemIndex);

            // ユーザーIDのバリデーション
            const userId = this.validateAndParseUserId(csvData['ユーザーID'], itemIndex);

            // 数値データの解析とバリデーション
            const loginIncrement = this.validateAndParseNumber(
                csvData['ログイン回数'], 
                'ログイン回数', 
                itemIndex
            );

            const postIncrement = this.validateAndParseNumber(
                csvData['投稿回数'], 
                '投稿回数', 
                itemIndex
            );

            // ビジネスルールバリデーション
            this.validateBusinessRules(userId, loginIncrement, postIncrement, itemIndex);

            this.logger.debug('CSV record processing completed', {
                itemIndex,
                userId,
                loginIncrement,
                postIncrement
            });

            return {
                userId,
                loginIncrement,
                postIncrement
            };

        } catch (error) {
            this.logger.error('CSV record processing failed', {
                itemIndex,
                error: error instanceof Error ? error.message : String(error),
                csvData: JSON.stringify(csvData)
            });
            throw error;
        }
    }

    /**
     * ユーザー統計の更新（ドメインロジック）
     * @param existingUser 既存ユーザー
     * @param loginIncrement ログイン回数増分
     * @param postIncrement 投稿回数増分
     * @returns 更新されたユーザー
     */
    async updateUserStatistics(
        existingUser: User,
        loginIncrement: number,
        postIncrement: number
    ): Promise<User> {
        this.logger.debug('Updating user statistics', {
            userId: existingUser.id,
            currentLogin: existingUser.statistics.loginCount,
            currentPost: existingUser.statistics.postCount,
            loginIncrement,
            postIncrement
        });

        try {
            // 現在の統計値取得
            const currentLoginCount = existingUser.statistics.loginCount;
            const currentPostCount = existingUser.statistics.postCount;

            // 新しい統計値計算
            const newLoginCount = currentLoginCount + loginIncrement;
            const newPostCount = currentPostCount + postIncrement;

            // ドメインモデルの更新（ビジネスルール適用）
            const updatedUser = new User(
                existingUser.id,
                existingUser.username,
                existingUser.email,
                new UserStatistics(newLoginCount, newPostCount),
                existingUser.createdAt,
                new Date() // updated_at を現在時刻に更新
            );

            // 更新後バリデーション
            this.validateUpdatedStatistics(
                existingUser.statistics,
                updatedUser.statistics,
                loginIncrement,
                postIncrement
            );

            this.logger.debug('User statistics updated successfully', {
                userId: existingUser.id,
                oldLoginCount: currentLoginCount,
                newLoginCount,
                oldPostCount: currentPostCount,
                newPostCount
            });

            return updatedUser;

        } catch (error) {
            this.logger.error('User statistics update failed', {
                userId: existingUser.id,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * CSVデータの必須フィールドバリデーション
     */
    private validateRequiredFields(csvData: Record<string, string>, itemIndex: number): void {
        const requiredFields = ['ユーザーID', 'ログイン回数', '投稿回数'];
        const missingFields: string[] = [];

        for (const field of requiredFields) {
            if (!csvData[field] || csvData[field].trim() === '') {
                missingFields.push(field);
            }
        }

        if (missingFields.length > 0) {
            throw new CsvValidationError(
                `Missing required fields at item ${itemIndex}: ${missingFields.join(', ')}`
            );
        }
    }

    /**
     * ユーザーIDのバリデーションと正規化
     */
    private validateAndParseUserId(userIdValue: string, itemIndex: number): string {
        const trimmedUserId = userIdValue.trim();

        // ユーザーID形式チェック（U + 5桁数字）
        const userIdPattern = /^U\d{5}$/;
        if (!userIdPattern.test(trimmedUserId)) {
            throw new CsvValidationError(
                `Invalid user ID format at item ${itemIndex}: "${trimmedUserId}" (expected format: U00000)`
            );
        }

        return trimmedUserId;
    }

    /**
     * 数値データのバリデーションとパース
     */
    private validateAndParseNumber(
        value: string, 
        fieldName: string, 
        itemIndex: number
    ): number {
        const trimmedValue = value.trim();

        // 空文字チェック
        if (trimmedValue === '') {
            throw new CsvValidationError(
                `Empty value for ${fieldName} at item ${itemIndex}`
            );
        }

        // 数値変換
        const parsedNumber = parseInt(trimmedValue, 10);
        
        // 変換結果チェック
        if (isNaN(parsedNumber)) {
            throw new CsvValidationError(
                `Invalid number format for ${fieldName} at item ${itemIndex}: "${trimmedValue}"`
            );
        }

        // 非負数チェック
        if (parsedNumber < 0) {
            throw new CsvValidationError(
                `Negative value not allowed for ${fieldName} at item ${itemIndex}: ${parsedNumber}`
            );
        }

        // 最大値チェック（整数オーバーフロー防止）
        if (parsedNumber > Number.MAX_SAFE_INTEGER) {
            throw new CsvValidationError(
                `Value too large for ${fieldName} at item ${itemIndex}: ${parsedNumber}`
            );
        }

        return parsedNumber;
    }

    /**
     * ビジネスルールバリデーション
     */
    private validateBusinessRules(
        userId: string,
        loginIncrement: number,
        postIncrement: number,
        itemIndex: number
    ): void {
        // 増分値の妥当性チェック
        if (loginIncrement === 0 && postIncrement === 0) {
            throw new BusinessRuleViolationError(
                `No meaningful update at item ${itemIndex}: both login and post increments are zero for user ${userId}`
            );
        }

        // 一度の処理での増分上限チェック（異常値検出）
        const MAX_REASONABLE_INCREMENT = 10000; // 一度に10,000回以上は異常とみなす
        
        if (loginIncrement > MAX_REASONABLE_INCREMENT) {
            throw new BusinessRuleViolationError(
                `Unusually large login increment at item ${itemIndex} for user ${userId}: ${loginIncrement} (max: ${MAX_REASONABLE_INCREMENT})`
            );
        }

        if (postIncrement > MAX_REASONABLE_INCREMENT) {
            throw new BusinessRuleViolationError(
                `Unusually large post increment at item ${itemIndex} for user ${userId}: ${postIncrement} (max: ${MAX_REASONABLE_INCREMENT})`
            );
        }
    }

    /**
     * 更新後統計値のバリデーション
     */
    private validateUpdatedStatistics(
        oldStats: UserStatistics,
        newStats: UserStatistics,
        loginIncrement: number,
        postIncrement: number
    ): void {
        // 計算結果の整合性チェック
        const expectedLoginCount = oldStats.loginCount + loginIncrement;
        const expectedPostCount = oldStats.postCount + postIncrement;

        if (newStats.loginCount !== expectedLoginCount) {
            throw new StatisticsConsistencyError(
                `Login count calculation error: expected ${expectedLoginCount}, got ${newStats.loginCount}`
            );
        }

        if (newStats.postCount !== expectedPostCount) {
            throw new StatisticsConsistencyError(
                `Post count calculation error: expected ${expectedPostCount}, got ${newStats.postCount}`
            );
        }

        // 統計値の非減少性チェック（ビジネスルール）
        if (newStats.loginCount < oldStats.loginCount) {
            throw new StatisticsConsistencyError(
                `Login count cannot decrease: ${oldStats.loginCount} -> ${newStats.loginCount}`
            );
        }

        if (newStats.postCount < oldStats.postCount) {
            throw new StatisticsConsistencyError(
                `Post count cannot decrease: ${oldStats.postCount} -> ${newStats.postCount}`
            );
        }
    }
}

/**
 * ユーザーログデータの型定義
 */
export interface UserLogData {
    userId: string;
    loginIncrement: number;
    postIncrement: number;
}

/**
 * CSV検証エラー
 */
export class CsvValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CsvValidationError';
    }
}

/**
 * ビジネスルール違反エラー
 */
export class BusinessRuleViolationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BusinessRuleViolationError';
    }
}

/**
 * 統計値整合性エラー
 */
export class StatisticsConsistencyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StatisticsConsistencyError';
    }
}