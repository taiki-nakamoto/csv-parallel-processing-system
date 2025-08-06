/**
 * 日付ユーティリティ（Lambda Layer）
 * 日付操作・フォーマット・計算の共通機能
 */
export class DateUtils {
    
    /**
     * 現在時刻をISO8601形式で取得
     * @returns ISO8601形式の文字列
     */
    static getCurrentISOString(): string {
        return new Date().toISOString();
    }

    /**
     * Unix timestamp to ISO8601
     * @param timestamp Unix timestamp (milliseconds)
     * @returns ISO8601形式の文字列
     */
    static timestampToISO(timestamp: number): string {
        return new Date(timestamp).toISOString();
    }

    /**
     * ISO8601 to Unix timestamp
     * @param isoString ISO8601形式の文字列
     * @returns Unix timestamp (milliseconds)
     */
    static isoToTimestamp(isoString: string): number {
        return new Date(isoString).getTime();
    }

    /**
     * 日付の加算
     * @param date 基準日付
     * @param amount 加算する数
     * @param unit 単位（days, hours, minutes, seconds）
     * @returns 加算後の日付
     */
    static addTime(
        date: Date,
        amount: number,
        unit: 'days' | 'hours' | 'minutes' | 'seconds'
    ): Date {
        const result = new Date(date.getTime());
        
        switch (unit) {
            case 'days':
                result.setDate(result.getDate() + amount);
                break;
            case 'hours':
                result.setHours(result.getHours() + amount);
                break;
            case 'minutes':
                result.setMinutes(result.getMinutes() + amount);
                break;
            case 'seconds':
                result.setSeconds(result.getSeconds() + amount);
                break;
        }
        
        return result;
    }

    /**
     * 日付の差分計算（ミリ秒）
     * @param startDate 開始日時
     * @param endDate 終了日時
     * @returns 差分（ミリ秒）
     */
    static getDifferenceMs(startDate: Date, endDate: Date): number {
        return endDate.getTime() - startDate.getTime();
    }

    /**
     * 日付の差分計算（人間が読める形式）
     * @param startDate 開始日時
     * @param endDate 終了日時
     * @returns 差分オブジェクト
     */
    static getDifferenceHuman(
        startDate: Date,
        endDate: Date
    ): {
        days: number;
        hours: number;
        minutes: number;
        seconds: number;
        totalMs: number;
    } {
        const totalMs = endDate.getTime() - startDate.getTime();
        const totalSeconds = Math.floor(totalMs / 1000);
        const totalMinutes = Math.floor(totalSeconds / 60);
        const totalHours = Math.floor(totalMinutes / 60);
        const days = Math.floor(totalHours / 24);

        return {
            days,
            hours: totalHours % 24,
            minutes: totalMinutes % 60,
            seconds: totalSeconds % 60,
            totalMs
        };
    }

    /**
     * 日付のフォーマット
     * @param date 日付
     * @param format フォーマット文字列（YYYY-MM-DD, YYYY-MM-DD HH:mm:ss等）
     * @returns フォーマット済み文字列
     */
    static formatDate(date: Date, format: string = 'YYYY-MM-DD HH:mm:ss'): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

        return format
            .replace('YYYY', String(year))
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds)
            .replace('SSS', milliseconds);
    }

    /**
     * 日付文字列のパース（複数形式対応）
     * @param dateString 日付文字列
     * @returns パースされた日付、またはnull
     */
    static parseDate(dateString: string): Date | null {
        // ISO8601形式
        if (dateString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
            const date = new Date(dateString);
            return isNaN(date.getTime()) ? null : date;
        }

        // YYYY-MM-DD形式
        if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const date = new Date(dateString + 'T00:00:00.000Z');
            return isNaN(date.getTime()) ? null : date;
        }

        // Unix timestamp（文字列）
        if (dateString.match(/^\d+$/)) {
            const timestamp = parseInt(dateString, 10);
            const date = new Date(timestamp);
            return isNaN(date.getTime()) ? null : date;
        }

        // その他の形式はDateコンストラクタに委ねる
        const date = new Date(dateString);
        return isNaN(date.getTime()) ? null : date;
    }

    /**
     * タイムゾーン変換
     * @param date 日付
     * @param targetTimeZone ターゲットタイムゾーン（例: 'Asia/Tokyo'）
     * @returns タイムゾーン変換後の文字列
     */
    static toTimeZone(date: Date, targetTimeZone: string): string {
        return date.toLocaleString('en-US', {
            timeZone: targetTimeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    /**
     * 日付が範囲内にあるかチェック
     * @param date チェック対象の日付
     * @param startDate 開始日時
     * @param endDate 終了日時
     * @returns 範囲内にある場合true
     */
    static isInRange(date: Date, startDate: Date, endDate: Date): boolean {
        return date >= startDate && date <= endDate;
    }

    /**
     * 月初・月末の取得
     * @param date 基準日付
     * @returns 月初・月末の日付
     */
    static getMonthBounds(date: Date): { start: Date; end: Date } {
        const start = new Date(date.getFullYear(), date.getMonth(), 1);
        const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
        
        return { start, end };
    }

    /**
     * 週初・週末の取得（月曜始まり）
     * @param date 基準日付
     * @returns 週初・週末の日付
     */
    static getWeekBounds(date: Date): { start: Date; end: Date } {
        const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ...
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday = start of week
        
        const start = new Date(date);
        start.setDate(date.getDate() + mondayOffset);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        
        return { start, end };
    }

    /**
     * 実行時間計測ヘルパー
     * @param fn 計測対象の関数
     * @returns 実行結果と実行時間
     */
    static async measureExecutionTime<T>(
        fn: () => Promise<T> | T
    ): Promise<{ result: T; executionTimeMs: number }> {
        const startTime = Date.now();
        const result = await fn();
        const executionTimeMs = Date.now() - startTime;
        
        return { result, executionTimeMs };
    }

    /**
     * TTL（Time To Live）計算
     * @param currentDate 現在日時
     * @param ttlDays TTL日数
     * @returns TTL期限のUnix timestamp（秒）
     */
    static calculateTtl(currentDate: Date, ttlDays: number): number {
        const ttlDate = DateUtils.addTime(currentDate, ttlDays, 'days');
        return Math.floor(ttlDate.getTime() / 1000); // DynamoDB TTLは秒単位
    }

    /**
     * パフォーマンス測定用の高精度タイマー
     * @returns 高精度timestamp（ナノ秒精度）
     */
    static getHighResolutionTime(): number {
        if (typeof performance !== 'undefined' && performance.now) {
            return performance.now();
        }
        // Node.js環境
        if (typeof process !== 'undefined' && process.hrtime) {
            const [seconds, nanoseconds] = process.hrtime();
            return seconds * 1000 + nanoseconds / 1e6;
        }
        // フォールバック
        return Date.now();
    }
}