/**
 * フォーマット変換ユーティリティ（Lambda Layer）
 * データフォーマットの変換機能
 */
export class FormatConverters {
    
    /**
     * CSVを2次元配列に変換
     * @param csvString CSV文字列
     * @param options 変換オプション
     * @returns 2次元配列
     */
    static csvToArray(
        csvString: string,
        options: {
            delimiter?: string;
            hasHeader?: boolean;
            skipEmptyLines?: boolean;
        } = {}
    ): string[][] | { headers: string[]; data: string[][] } {
        const {
            delimiter = ',',
            hasHeader = false,
            skipEmptyLines = true
        } = options;

        const lines = csvString.split('\n');
        const result: string[][] = [];

        for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (skipEmptyLines && !trimmedLine) {
                continue;
            }

            // 簡易CSV解析（ダブルクォートを考慮）
            const fields = FormatConverters.parseCsvLine(trimmedLine, delimiter);
            result.push(fields);
        }

        if (hasHeader && result.length > 0) {
            const headers = result.shift()!;
            return {
                headers,
                data: result
            };
        }

        return result;
    }

    /**
     * CSV行の解析（ダブルクォート対応）
     * @param line CSV行
     * @param delimiter 区切り文字
     * @returns フィールド配列
     */
    private static parseCsvLine(line: string, delimiter: string): string[] {
        const fields: string[] = [];
        let currentField = '';
        let inQuotes = false;
        let i = 0;

        while (i < line.length) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                    // エスケープされたダブルクォート
                    currentField += '"';
                    i += 2;
                } else {
                    // クォートの開始または終了
                    inQuotes = !inQuotes;
                    i++;
                }
            } else if (char === delimiter && !inQuotes) {
                // フィールド区切り
                fields.push(currentField);
                currentField = '';
                i++;
            } else {
                currentField += char;
                i++;
            }
        }

        // 最後のフィールドを追加
        fields.push(currentField);

        return fields;
    }

    /**
     * 2次元配列をCSVに変換
     * @param data 2次元配列
     * @param options 変換オプション
     * @returns CSV文字列
     */
    static arrayToCsv(
        data: string[][],
        options: {
            delimiter?: string;
            quoteAll?: boolean;
            lineBreak?: string;
        } = {}
    ): string {
        const {
            delimiter = ',',
            quoteAll = false,
            lineBreak = '\n'
        } = options;

        const lines = data.map(row => {
            return row.map(field => {
                const needsQuoting = quoteAll || 
                    field.includes(delimiter) || 
                    field.includes('\n') || 
                    field.includes('\r') || 
                    field.includes('"');

                if (needsQuoting) {
                    const escaped = field.replace(/"/g, '""');
                    return `"${escaped}"`;
                }
                
                return field;
            }).join(delimiter);
        });

        return lines.join(lineBreak);
    }

    /**
     * JSONをCSVに変換
     * @param jsonData JSONデータ（オブジェクトの配列）
     * @param options 変換オプション
     * @returns CSV文字列
     */
    static jsonToCsv(
        jsonData: Record<string, any>[],
        options: {
            fields?: string[];
            includeHeader?: boolean;
            delimiter?: string;
        } = {}
    ): string {
        if (!Array.isArray(jsonData) || jsonData.length === 0) {
            return '';
        }

        const {
            fields = Object.keys(jsonData[0]),
            includeHeader = true,
            delimiter = ','
        } = options;

        const rows: string[][] = [];

        // ヘッダー行
        if (includeHeader) {
            rows.push(fields);
        }

        // データ行
        for (const item of jsonData) {
            const row = fields.map(field => {
                const value = item[field];
                if (value === null || value === undefined) {
                    return '';
                }
                return String(value);
            });
            rows.push(row);
        }

        return FormatConverters.arrayToCsv(rows, { delimiter });
    }

    /**
     * CSVをJSONに変換
     * @param csvString CSV文字列
     * @param options 変換オプション
     * @returns JSONオブジェクトの配列
     */
    static csvToJson(
        csvString: string,
        options: {
            delimiter?: string;
            headers?: string[];
        } = {}
    ): Record<string, string>[] {
        const { delimiter = ',' } = options;
        
        const parsed = FormatConverters.csvToArray(csvString, {
            delimiter,
            hasHeader: true,
            skipEmptyLines: true
        });

        if (Array.isArray(parsed)) {
            throw new Error('CSV must have headers for JSON conversion');
        }

        const { headers, data } = parsed;
        const customHeaders = options.headers || headers;

        return data.map(row => {
            const obj: Record<string, string> = {};
            customHeaders.forEach((header, index) => {
                obj[header] = row[index] || '';
            });
            return obj;
        });
    }

    /**
     * XML風文字列をオブジェクトに変換（簡易版）
     * @param xmlString XML文字列
     * @returns パース結果
     */
    static parseSimpleXml(xmlString: string): Record<string, any> {
        const result: Record<string, any> = {};
        
        // 簡易XML解析（ネストされた構造は非対応）
        const tagPattern = /<(\w+)>([^<]*)<\/\1>/g;
        let match;

        while ((match = tagPattern.exec(xmlString)) !== null) {
            const [, tagName, content] = match;
            result[tagName] = content.trim();
        }

        return result;
    }

    /**
     * オブジェクトを簡易XML文字列に変換
     * @param obj オブジェクト
     * @param rootElement ルート要素名
     * @returns XML文字列
     */
    static objectToSimpleXml(
        obj: Record<string, any>,
        rootElement: string = 'root'
    ): string {
        const elements = Object.entries(obj).map(([key, value]) => {
            const escapedValue = String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            return `  <${key}>${escapedValue}</${key}>`;
        });

        return `<${rootElement}>\n${elements.join('\n')}\n</${rootElement}>`;
    }

    /**
     * バイト数を人間が読める形式に変換
     * @param bytes バイト数
     * @param decimals 小数点以下桁数
     * @returns フォーマット済み文字列
     */
    static formatBytes(bytes: number, decimals: number = 2): string {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    /**
     * 人間が読める形式のバイト数を数値に変換
     * @param sizeString サイズ文字列（例: "1.5 MB"）
     * @returns バイト数
     */
    static parseBytes(sizeString: string): number {
        const units: Record<string, number> = {
            'B': 1,
            'BYTES': 1,
            'KB': 1024,
            'MB': 1024 * 1024,
            'GB': 1024 * 1024 * 1024,
            'TB': 1024 * 1024 * 1024 * 1024,
        };

        const match = sizeString.match(/^([\d.]+)\s*([A-Z]+)$/i);
        if (!match) {
            throw new Error(`Invalid size format: ${sizeString}`);
        }

        const [, numStr, unitStr] = match;
        const num = parseFloat(numStr);
        const unit = units[unitStr.toUpperCase()];

        if (!unit) {
            throw new Error(`Unknown unit: ${unitStr}`);
        }

        return Math.round(num * unit);
    }

    /**
     * 数値を通貨形式に変換
     * @param amount 金額
     * @param currency 通貨コード
     * @param locale ロケール
     * @returns フォーマット済み通貨文字列
     */
    static formatCurrency(
        amount: number,
        currency: string = 'USD',
        locale: string = 'en-US'
    ): string {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
        }).format(amount);
    }

    /**
     * パーセンテージ形式に変換
     * @param value 値（0-1の範囲）
     * @param decimals 小数点以下桁数
     * @param locale ロケール
     * @returns フォーマット済みパーセンテージ文字列
     */
    static formatPercentage(
        value: number,
        decimals: number = 2,
        locale: string = 'en-US'
    ): string {
        return new Intl.NumberFormat(locale, {
            style: 'percent',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        }).format(value);
    }

    /**
     * Base64エンコード
     * @param str 文字列
     * @returns Base64エンコード済み文字列
     */
    static encodeBase64(str: string): string {
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(str, 'utf8').toString('base64');
        }
        // ブラウザ環境
        return btoa(unescape(encodeURIComponent(str)));
    }

    /**
     * Base64デコード
     * @param base64 Base64文字列
     * @returns デコード済み文字列
     */
    static decodeBase64(base64: string): string {
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(base64, 'base64').toString('utf8');
        }
        // ブラウザ環境
        return decodeURIComponent(escape(atob(base64)));
    }

    /**
     * URLクエリパラメータをオブジェクトに変換
     * @param queryString クエリ文字列（?を含まない）
     * @returns クエリパラメータオブジェクト
     */
    static parseQueryString(queryString: string): Record<string, string> {
        const params: Record<string, string> = {};
        
        if (!queryString) {
            return params;
        }

        const pairs = queryString.split('&');
        
        for (const pair of pairs) {
            const [key, value = ''] = pair.split('=');
            const decodedKey = decodeURIComponent(key);
            const decodedValue = decodeURIComponent(value);
            params[decodedKey] = decodedValue;
        }

        return params;
    }

    /**
     * オブジェクトをURLクエリ文字列に変換
     * @param params パラメータオブジェクト
     * @returns クエリ文字列
     */
    static objectToQueryString(params: Record<string, any>): string {
        const pairs: string[] = [];
        
        for (const [key, value] of Object.entries(params)) {
            if (value !== null && value !== undefined) {
                const encodedKey = encodeURIComponent(key);
                const encodedValue = encodeURIComponent(String(value));
                pairs.push(`${encodedKey}=${encodedValue}`);
            }
        }

        return pairs.join('&');
    }

    /**
     * フラットなオブジェクトをネストしたオブジェクトに変換
     * @param flatObj フラットなオブジェクト（ドット区切りキー）
     * @returns ネストしたオブジェクト
     */
    static flattenToNested(flatObj: Record<string, any>): Record<string, any> {
        const result: Record<string, any> = {};

        for (const [key, value] of Object.entries(flatObj)) {
            const keys = key.split('.');
            let current = result;

            for (let i = 0; i < keys.length - 1; i++) {
                const k = keys[i];
                if (!(k in current)) {
                    current[k] = {};
                }
                current = current[k];
            }

            current[keys[keys.length - 1]] = value;
        }

        return result;
    }

    /**
     * ネストしたオブジェクトをフラットなオブジェクトに変換
     * @param nestedObj ネストしたオブジェクト
     * @param prefix プレフィックス
     * @returns フラットなオブジェクト
     */
    static nestedToFlat(
        nestedObj: Record<string, any>,
        prefix: string = ''
    ): Record<string, any> {
        const result: Record<string, any> = {};

        for (const [key, value] of Object.entries(nestedObj)) {
            const newKey = prefix ? `${prefix}.${key}` : key;

            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                Object.assign(result, FormatConverters.nestedToFlat(value, newKey));
            } else {
                result[newKey] = value;
            }
        }

        return result;
    }
}