import { Logger } from '@aws-lambda-powertools/logger';
import { BaseError } from '../errors/BaseError';

const logger = new Logger({ serviceName: 'RetryStrategy' });

/**
 * リトライ戦略サービス（ドメイン層）
 * Jittered Exponential Backoff実装
 * 設計書準拠: 02-01_基本設計書_Lambda開発標準仕様書.md
 */
export class RetryStrategy {
    /**
     * リトライ可否判定
     * @param error エラーオブジェクト
     * @returns リトライ可能かどうか
     */
    static isRetryable(error: Error): boolean {
        // BaseErrorの場合はisRetryableプロパティを使用
        if (error instanceof BaseError) {
            return error.isRetryable;
        }

        // AWS SDKエラーの場合
        if ('statusCode' in error && typeof error.statusCode === 'number') {
            // リトライ可能なHTTPステータスコード
            const retryableStatusCodes = [
                408, // Request Timeout
                429, // Too Many Requests
                500, // Internal Server Error
                502, // Bad Gateway
                503, // Service Unavailable
                504  // Gateway Timeout
            ];
            return retryableStatusCodes.includes(error.statusCode);
        }

        // ネットワークエラーの場合
        if (error.message) {
            const retryableMessages = [
                'ECONNRESET',
                'ETIMEDOUT',
                'ENOTFOUND',
                'ECONNREFUSED',
                'NetworkingError',
                'TimeoutError'
            ];
            return retryableMessages.some(msg => error.message.includes(msg));
        }

        // デフォルトはリトライ不可
        return false;
    }

    /**
     * Jittered Exponential Backoffによるリトライ実行
     * @param fn 実行する関数
     * @param options リトライオプション
     * @returns 実行結果
     */
    static async withRetry<T>(
        fn: () => Promise<T>,
        options: RetryOptions = {}
    ): Promise<T> {
        const {
            maxAttempts = 3,
            initialDelay = 1000,
            maxDelay = 30000,
            backoffFactor = 2,
            jitterFactor = 0.3,
            onRetry,
            retryCondition = RetryStrategy.isRetryable
        } = options;

        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                logger.debug('Executing function', { attempt, maxAttempts });
                const result = await fn();
                
                if (attempt > 1) {
                    logger.info('Function succeeded after retry', { 
                        attempt, 
                        totalAttempts: attempt 
                    });
                }
                
                return result;

            } catch (error) {
                lastError = error as Error;

                logger.warn('Function execution failed', {
                    attempt,
                    maxAttempts,
                    error: lastError.message,
                    errorName: lastError.name
                });

                // 最後の試行またはリトライ不可能なエラーの場合
                if (attempt === maxAttempts || !retryCondition(lastError)) {
                    logger.error('Retry exhausted or non-retryable error', {
                        attempt,
                        maxAttempts,
                        isRetryable: retryCondition(lastError),
                        error: lastError.message
                    });
                    throw lastError;
                }

                // リトライ待機時間を計算（Jittered Exponential Backoff）
                const delay = RetryStrategy.calculateDelay(
                    attempt,
                    initialDelay,
                    maxDelay,
                    backoffFactor,
                    jitterFactor
                );

                logger.info('Retrying after delay', {
                    attempt,
                    nextAttempt: attempt + 1,
                    delayMs: delay
                });

                // リトライコールバック実行
                if (onRetry) {
                    await onRetry(attempt, lastError, delay);
                }

                // 待機
                await RetryStrategy.sleep(delay);
            }
        }

        throw lastError!;
    }

    /**
     * Circuit Breakerパターン実装
     * @param fn 実行する関数
     * @param options Circuit Breakerオプション
     * @returns Circuit Breaker付き関数
     */
    static withCircuitBreaker<T>(
        fn: () => Promise<T>,
        options: CircuitBreakerOptions = {}
    ): CircuitBreakerFunction<T> {
        const {
            failureThreshold = 5,
            resetTimeout = 60000,
            halfOpenMaxAttempts = 3
        } = options;

        const state: CircuitBreakerState = {
            status: 'CLOSED',
            failureCount: 0,
            lastFailureTime: null,
            halfOpenAttempts: 0
        };

        return async function executedWithCircuitBreaker(): Promise<T> {
            // Circuit Breakerの状態をチェック
            const currentStatus = RetryStrategy.getCircuitStatus(
                state,
                resetTimeout,
                failureThreshold
            );

            if (currentStatus === 'OPEN') {
                logger.warn('Circuit breaker is OPEN, rejecting request');
                throw new CircuitBreakerOpenError('Circuit breaker is OPEN');
            }

            try {
                const result = await fn();

                // 成功時の状態更新
                if (currentStatus === 'HALF_OPEN') {
                    logger.info('Circuit breaker recovering, resetting to CLOSED');
                    state.status = 'CLOSED';
                    state.failureCount = 0;
                    state.halfOpenAttempts = 0;
                } else if (state.failureCount > 0) {
                    // 部分的な失敗からの回復
                    state.failureCount = Math.max(0, state.failureCount - 1);
                }

                return result;

            } catch (error) {
                // 失敗時の状態更新
                state.failureCount++;
                state.lastFailureTime = Date.now();

                if (currentStatus === 'HALF_OPEN') {
                    state.halfOpenAttempts++;
                    
                    if (state.halfOpenAttempts >= halfOpenMaxAttempts) {
                        logger.warn('Circuit breaker HALF_OPEN attempts exhausted, returning to OPEN');
                        state.status = 'OPEN';
                        state.halfOpenAttempts = 0;
                    }
                }

                if (state.failureCount >= failureThreshold) {
                    logger.error('Circuit breaker threshold exceeded, opening circuit', {
                        failureCount: state.failureCount,
                        threshold: failureThreshold
                    });
                    state.status = 'OPEN';
                }

                throw error;
            }
        };
    }

    /**
     * リトライ遅延時間計算（Jittered Exponential Backoff）
     */
    private static calculateDelay(
        attempt: number,
        initialDelay: number,
        maxDelay: number,
        backoffFactor: number,
        jitterFactor: number
    ): number {
        // Exponential Backoff計算
        const exponentialDelay = initialDelay * Math.pow(backoffFactor, attempt - 1);
        
        // 最大遅延時間でキャップ
        const cappedDelay = Math.min(exponentialDelay, maxDelay);
        
        // Jitter追加（±jitterFactor%のランダム性）
        const jitter = cappedDelay * jitterFactor * (Math.random() * 2 - 1);
        const delayWithJitter = cappedDelay + jitter;
        
        // 最小値を初期遅延の半分に設定
        return Math.max(initialDelay / 2, delayWithJitter);
    }

    /**
     * Circuit Breakerの状態を取得
     */
    private static getCircuitStatus(
        state: CircuitBreakerState,
        resetTimeout: number,
        failureThreshold: number
    ): CircuitStatus {
        if (state.status === 'OPEN' && state.lastFailureTime) {
            const timeSinceLastFailure = Date.now() - state.lastFailureTime;
            
            if (timeSinceLastFailure >= resetTimeout) {
                logger.info('Circuit breaker timeout reached, switching to HALF_OPEN');
                state.status = 'HALF_OPEN';
                return 'HALF_OPEN';
            }
        }

        if (state.status === 'CLOSED' && state.failureCount >= failureThreshold) {
            state.status = 'OPEN';
            return 'OPEN';
        }

        return state.status;
    }

    /**
     * スリープ関数
     */
    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * リトライオプション型定義
 */
export interface RetryOptions {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    jitterFactor?: number;
    onRetry?: (attempt: number, error: Error, delay: number) => Promise<void> | void;
    retryCondition?: (error: Error) => boolean;
}

/**
 * Circuit Breakerオプション型定義
 */
export interface CircuitBreakerOptions {
    failureThreshold?: number;
    resetTimeout?: number;
    halfOpenMaxAttempts?: number;
}

/**
 * Circuit Breaker状態型定義
 */
interface CircuitBreakerState {
    status: CircuitStatus;
    failureCount: number;
    lastFailureTime: number | null;
    halfOpenAttempts: number;
}

/**
 * Circuit Breakerステータス型
 */
type CircuitStatus = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit Breaker付き関数型
 */
type CircuitBreakerFunction<T> = () => Promise<T>;

/**
 * Circuit Breaker Openエラー
 */
export class CircuitBreakerOpenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CircuitBreakerOpenError';
    }
}