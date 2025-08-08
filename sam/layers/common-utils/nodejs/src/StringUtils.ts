/**
 * 文字列ユーティリティ（Lambda Layer）
 * 文字列操作・バリデーション・変換の共通機能
 */
export class StringUtils {
    
    /**
     * 文字列のトリム（前後の空白除去）
     * @param str 対象文字列
     * @returns トリム済み文字列
     */
    static trim(str: string): string {
        return str?.trim() || '';
    }

    /**
     * 文字列が空またはnull/undefinedかチェック
     * @param str チェック対象
     * @returns 空の場合true
     */
    static isEmpty(str: string | null | undefined): boolean {
        return !str || str.trim() === '';
    }

    /**
     * 文字列が空でないことをチェック
     * @param str チェック対象
     * @returns 空でない場合true
     */
    static isNotEmpty(str: string | null | undefined): boolean {
        return !StringUtils.isEmpty(str);
    }

    /**
     * 文字列の長さチェック
     * @param str 対象文字列
     * @param min 最小長さ
     * @param max 最大長さ
     * @returns 範囲内の場合true
     */
    static isLengthInRange(
        str: string,
        min: number = 0,
        max: number = Number.MAX_SAFE_INTEGER
    ): boolean {
        const length = str?.length || 0;
        return length >= min && length <= max;
    }

    /**
     * キャメルケースからスネークケースに変換
     * @param str キャメルケース文字列
     * @returns スネークケース文字列
     */
    static camelToSnake(str: string): string {
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    }

    /**
     * スネークケースからキャメルケースに変換
     * @param str スネークケース文字列
     * @returns キャメルケース文字列
     */
    static snakeToCamel(str: string): string {
        return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    }

    /**
     * パスカルケース（先頭大文字のキャメルケース）に変換
     * @param str 対象文字列
     * @returns パスカルケース文字列
     */
    static toPascalCase(str: string): string {
        const camelCase = StringUtils.snakeToCamel(str);
        return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
    }

    /**
     * ケバブケース（ハイフン区切り）に変換
     * @param str 対象文字列
     * @returns ケバブケース文字列
     */
    static toKebabCase(str: string): string {
        return str
            .replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
            .replace(/^-/, ''); // 先頭のハイフンを除去
    }

    /**
     * 文字列の先頭・末尾の特定文字を除去
     * @param str 対象文字列
     * @param chars 除去する文字（デフォルト: 空白文字）
     * @returns 除去済み文字列
     */
    static stripChars(str: string, chars: string = ' \t\n\r'): string {
        const pattern = `[${chars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`;
        const regex = new RegExp(`^${pattern}+|${pattern}+$`, 'g');
        return str.replace(regex, '');
    }

    /**
     * 文字列の置換（全て）
     * @param str 対象文字列
     * @param search 検索文字列
     * @param replacement 置換文字列
     * @returns 置換済み文字列
     */
    static replaceAll(str: string, search: string, replacement: string): string {
        return str.split(search).join(replacement);
    }

    /**
     * 文字列のエスケープ（HTML）
     * @param str 対象文字列
     * @returns エスケープ済み文字列
     */
    static escapeHtml(str: string): string {
        const htmlEscapes: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        
        return str.replace(/[&<>"']/g, match => htmlEscapes[match]);
    }

    /**
     * 文字列のエスケープ（CSV）
     * @param str 対象文字列
     * @returns エスケープ済み文字列
     */
    static escapeCsv(str: string): string {
        // カンマ、改行、ダブルクォートが含まれる場合はダブルクォートで囲む
        if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
            // ダブルクォートをエスケープ
            const escaped = str.replace(/"/g, '""');
            return `"${escaped}"`;
        }
        return str;
    }

    /**
     * JSON文字列の安全なパース
     * @param str JSON文字列
     * @param defaultValue デフォルト値
     * @returns パース結果またはデフォルト値
     */
    static safeJsonParse<T>(str: string, defaultValue: T): T {
        try {
            return JSON.parse(str);
        } catch {
            return defaultValue;
        }
    }

    /**
     * 文字列の切り詰め（省略記号付き）
     * @param str 対象文字列
     * @param maxLength 最大長さ
     * @param suffix 省略記号（デフォルト: '...'）
     * @returns 切り詰められた文字列
     */
    static truncate(str: string, maxLength: number, suffix: string = '...'): string {
        if (str.length <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength - suffix.length) + suffix;
    }

    /**
     * ランダム文字列生成
     * @param length 文字列長
     * @param charset 使用文字セット
     * @returns ランダム文字列
     */
    static randomString(
        length: number,
        charset: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    ): string {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return result;
    }

    /**
     * UUID v4生成（簡易版）
     * @returns UUID v4形式の文字列
     */
    static generateUuid(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * 文字列のハッシュ値生成（シンプルなハッシュ）
     * @param str 対象文字列
     * @returns ハッシュ値
     */
    static simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit整数に変換
        }
        return hash;
    }

    /**
     * 文字列の類似度計算（Levenshtein距離ベース）
     * @param str1 文字列1
     * @param str2 文字列2
     * @returns 類似度（0-1、1が完全一致）
     */
    static similarity(str1: string, str2: string): number {
        const maxLength = Math.max(str1.length, str2.length);
        if (maxLength === 0) return 1;
        
        const distance = StringUtils.levenshteinDistance(str1, str2);
        return (maxLength - distance) / maxLength;
    }

    /**
     * Levenshtein距離計算
     * @param str1 文字列1
     * @param str2 文字列2
     * @returns 編集距離
     */
    private static levenshteinDistance(str1: string, str2: string): number {
        const matrix: number[][] = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * 文字列のマスキング
     * @param str 対象文字列
     * @param maskChar マスク文字（デフォルト: '*'）
     * @param visibleStart 先頭の可視文字数
     * @param visibleEnd 末尾の可視文字数
     * @returns マスキング済み文字列
     */
    static mask(
        str: string,
        maskChar: string = '*',
        visibleStart: number = 2,
        visibleEnd: number = 2
    ): string {
        if (str.length <= visibleStart + visibleEnd) {
            return maskChar.repeat(str.length);
        }
        
        const start = str.substring(0, visibleStart);
        const end = str.substring(str.length - visibleEnd);
        const middle = maskChar.repeat(str.length - visibleStart - visibleEnd);
        
        return start + middle + end;
    }

    /**
     * 文字エンコーディング検出（簡易版）
     * @param buffer バイト配列
     * @returns 推定エンコーディング
     */
    static detectEncoding(buffer: Buffer): 'UTF-8' | 'Shift_JIS' | 'EUC-JP' | 'ASCII' | 'UNKNOWN' {
        // BOM確認
        if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
            return 'UTF-8';
        }
        
        // ASCII確認
        let isAscii = true;
        for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
            if (buffer[i] > 127) {
                isAscii = false;
                break;
            }
        }
        
        if (isAscii) return 'ASCII';
        
        // 簡易的な日本語エンコーディング判定
        const str = buffer.toString('utf8');
        try {
            if (str.includes('\uFFFD')) {
                // UTF-8でないバイト列が含まれている可能性
                return 'Shift_JIS'; // 簡易判定
            }
            return 'UTF-8';
        } catch {
            return 'UNKNOWN';
        }
    }

    /**
     * 改行コード統一
     * @param str 対象文字列
     * @param newline 新しい改行コード（デフォルト: '\n'）
     * @returns 改行コード統一済み文字列
     */
    static normalizeNewlines(str: string, newline: string = '\n'): string {
        return str.replace(/\r\n|\r|\n/g, newline);
    }
}