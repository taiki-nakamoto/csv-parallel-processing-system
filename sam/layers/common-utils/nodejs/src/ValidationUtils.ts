/**
 * バリデーションユーティリティ（Lambda Layer）
 * 汎用的なバリデーション機能
 */
export class ValidationUtils {
    
    // 正規表現パターン
    private static readonly EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    private static readonly URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
    private static readonly UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    private static readonly IPV4_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    private static readonly PHONE_JP_PATTERN = /^0\d{1,4}-\d{1,4}-\d{4}$/; // 日本の電話番号（ハイフンあり）
    private static readonly POSTAL_CODE_JP_PATTERN = /^\d{3}-\d{4}$/; // 日本の郵便番号

    /**
     * 必須フィールドの検証
     * @param value 検証対象の値
     * @param fieldName フィールド名（エラーメッセージ用）
     * @returns 検証結果
     */
    static isRequired(value: any, fieldName: string = 'Field'): ValidationResult {
        if (value === null || value === undefined || value === '') {
            return {
                isValid: false,
                errors: [`${fieldName} is required`]
            };
        }
        return { isValid: true, errors: [] };
    }

    /**
     * 文字列長の検証
     * @param value 文字列
     * @param min 最小長さ
     * @param max 最大長さ
     * @param fieldName フィールド名
     * @returns 検証結果
     */
    static validateLength(
        value: string,
        min: number = 0,
        max: number = Number.MAX_SAFE_INTEGER,
        fieldName: string = 'Field'
    ): ValidationResult {
        const errors: string[] = [];
        
        if (typeof value !== 'string') {
            errors.push(`${fieldName} must be a string`);
            return { isValid: false, errors };
        }

        const length = value.length;
        
        if (length < min) {
            errors.push(`${fieldName} must be at least ${min} characters long`);
        }
        
        if (length > max) {
            errors.push(`${fieldName} must be no more than ${max} characters long`);
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * 数値の範囲検証
     * @param value 数値
     * @param min 最小値
     * @param max 最大値
     * @param fieldName フィールド名
     * @returns 検証結果
     */
    static validateRange(
        value: number,
        min: number = Number.MIN_SAFE_INTEGER,
        max: number = Number.MAX_SAFE_INTEGER,
        fieldName: string = 'Field'
    ): ValidationResult {
        const errors: string[] = [];
        
        if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`${fieldName} must be a valid number`);
            return { isValid: false, errors };
        }

        if (value < min) {
            errors.push(`${fieldName} must be at least ${min}`);
        }
        
        if (value > max) {
            errors.push(`${fieldName} must be no more than ${max}`);
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * メールアドレスの検証
     * @param email メールアドレス
     * @param fieldName フィールド名
     * @returns 検証結果
     */
    static validateEmail(email: string, fieldName: string = 'Email'): ValidationResult {
        if (!email || typeof email !== 'string') {
            return {
                isValid: false,
                errors: [`${fieldName} is required`]
            };
        }

        if (!ValidationUtils.EMAIL_PATTERN.test(email)) {
            return {
                isValid: false,
                errors: [`${fieldName} must be a valid email address`]
            };
        }

        if (email.length > 254) { // RFC 5321制限
            return {
                isValid: false,
                errors: [`${fieldName} is too long (max 254 characters)`]
            };
        }

        return { isValid: true, errors: [] };
    }

    /**
     * URLの検証
     * @param url URL文字列
     * @param fieldName フィールド名
     * @returns 検証結果
     */
    static validateUrl(url: string, fieldName: string = 'URL'): ValidationResult {
        if (!url || typeof url !== 'string') {
            return {
                isValid: false,
                errors: [`${fieldName} is required`]
            };
        }

        if (!ValidationUtils.URL_PATTERN.test(url)) {
            return {
                isValid: false,
                errors: [`${fieldName} must be a valid URL`]
            };
        }

        return { isValid: true, errors: [] };
    }

    /**
     * UUIDの検証
     * @param uuid UUID文字列
     * @param fieldName フィールド名
     * @returns 検証結果
     */
    static validateUuid(uuid: string, fieldName: string = 'UUID'): ValidationResult {
        if (!uuid || typeof uuid !== 'string') {
            return {
                isValid: false,
                errors: [`${fieldName} is required`]
            };
        }

        if (!ValidationUtils.UUID_PATTERN.test(uuid)) {
            return {
                isValid: false,
                errors: [`${fieldName} must be a valid UUID`]
            };
        }

        return { isValid: true, errors: [] };
    }

    /**
     * IPv4アドレスの検証
     * @param ip IP文字列
     * @param fieldName フィールド名
     * @returns 検証結果
     */
    static validateIPv4(ip: string, fieldName: string = 'IP Address'): ValidationResult {
        if (!ip || typeof ip !== 'string') {
            return {
                isValid: false,
                errors: [`${fieldName} is required`]
            };
        }

        if (!ValidationUtils.IPV4_PATTERN.test(ip)) {
            return {
                isValid: false,
                errors: [`${fieldName} must be a valid IPv4 address`]
            };
        }

        return { isValid: true, errors: [] };
    }

    /**
     * 日本の電話番号検証
     * @param phone 電話番号
     * @param fieldName フィールド名
     * @returns 検証結果
     */
    static validatePhoneJP(phone: string, fieldName: string = 'Phone Number'): ValidationResult {
        if (!phone || typeof phone !== 'string') {
            return {
                isValid: false,
                errors: [`${fieldName} is required`]
            };
        }

        if (!ValidationUtils.PHONE_JP_PATTERN.test(phone)) {
            return {
                isValid: false,
                errors: [`${fieldName} must be a valid Japanese phone number (e.g., 03-1234-5678)`]
            };
        }

        return { isValid: true, errors: [] };
    }

    /**
     * 日本の郵便番号検証
     * @param postalCode 郵便番号
     * @param fieldName フィールド名
     * @returns 検証結果
     */
    static validatePostalCodeJP(postalCode: string, fieldName: string = 'Postal Code'): ValidationResult {
        if (!postalCode || typeof postalCode !== 'string') {
            return {
                isValid: false,
                errors: [`${fieldName} is required`]
            };
        }

        if (!ValidationUtils.POSTAL_CODE_JP_PATTERN.test(postalCode)) {
            return {
                isValid: false,
                errors: [`${fieldName} must be a valid Japanese postal code (e.g., 123-4567)`]
            };
        }

        return { isValid: true, errors: [] };
    }

    /**
     * 日付文字列の検証
     * @param dateString 日付文字列
     * @param fieldName フィールド名
     * @returns 検証結果
     */
    static validateDate(dateString: string, fieldName: string = 'Date'): ValidationResult {
        if (!dateString || typeof dateString !== 'string') {
            return {
                isValid: false,
                errors: [`${fieldName} is required`]
            };
        }

        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return {
                isValid: false,
                errors: [`${fieldName} must be a valid date`]
            };
        }

        return { isValid: true, errors: [], parsedValue: date };
    }

    /**
     * 日付範囲の検証
     * @param dateString 日付文字列
     * @param minDate 最小日付
     * @param maxDate 最大日付
     * @param fieldName フィールド名
     * @returns 検証結果
     */
    static validateDateRange(
        dateString: string,
        minDate?: Date,
        maxDate?: Date,
        fieldName: string = 'Date'
    ): ValidationResult {
        const dateValidation = ValidationUtils.validateDate(dateString, fieldName);
        if (!dateValidation.isValid) {
            return dateValidation;
        }

        const date = dateValidation.parsedValue as Date;
        const errors: string[] = [];

        if (minDate && date < minDate) {
            errors.push(`${fieldName} must be after ${minDate.toISOString().split('T')[0]}`);
        }

        if (maxDate && date > maxDate) {
            errors.push(`${fieldName} must be before ${maxDate.toISOString().split('T')[0]}`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            parsedValue: date
        };
    }

    /**
     * JSON文字列の検証
     * @param jsonString JSON文字列
     * @param fieldName フィールド名
     * @returns 検証結果
     */
    static validateJson(jsonString: string, fieldName: string = 'JSON'): ValidationResult {
        if (!jsonString || typeof jsonString !== 'string') {
            return {
                isValid: false,
                errors: [`${fieldName} is required`]
            };
        }

        try {
            const parsed = JSON.parse(jsonString);
            return { 
                isValid: true, 
                errors: [], 
                parsedValue: parsed 
            };
        } catch (error) {
            return {
                isValid: false,
                errors: [`${fieldName} must be valid JSON`]
            };
        }
    }

    /**
     * 配列の検証
     * @param array 配列
     * @param minItems 最小要素数
     * @param maxItems 最大要素数
     * @param fieldName フィールド名
     * @returns 検証結果
     */
    static validateArray(
        array: any[],
        minItems: number = 0,
        maxItems: number = Number.MAX_SAFE_INTEGER,
        fieldName: string = 'Array'
    ): ValidationResult {
        if (!Array.isArray(array)) {
            return {
                isValid: false,
                errors: [`${fieldName} must be an array`]
            };
        }

        const errors: string[] = [];
        const length = array.length;

        if (length < minItems) {
            errors.push(`${fieldName} must have at least ${minItems} items`);
        }

        if (length > maxItems) {
            errors.push(`${fieldName} must have no more than ${maxItems} items`);
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * 正規表現パターンマッチング
     * @param value 値
     * @param pattern 正規表現パターン
     * @param fieldName フィールド名
     * @param errorMessage カスタムエラーメッセージ
     * @returns 検証結果
     */
    static validatePattern(
        value: string,
        pattern: RegExp,
        fieldName: string = 'Field',
        errorMessage?: string
    ): ValidationResult {
        if (!value || typeof value !== 'string') {
            return {
                isValid: false,
                errors: [`${fieldName} is required`]
            };
        }

        if (!pattern.test(value)) {
            const message = errorMessage || `${fieldName} does not match required format`;
            return {
                isValid: false,
                errors: [message]
            };
        }

        return { isValid: true, errors: [] };
    }

    /**
     * 複数の検証を実行
     * @param validations 検証関数の配列
     * @returns 統合検証結果
     */
    static validateMultiple(validations: (() => ValidationResult)[]): ValidationResult {
        const allErrors: string[] = [];
        let hasInvalid = false;

        for (const validation of validations) {
            const result = validation();
            if (!result.isValid) {
                hasInvalid = true;
                allErrors.push(...result.errors);
            }
        }

        return {
            isValid: !hasInvalid,
            errors: allErrors
        };
    }

    /**
     * オブジェクトスキーマ検証（簡易版）
     * @param obj 検証対象オブジェクト
     * @param schema スキーマ定義
     * @returns 検証結果
     */
    static validateObjectSchema(
        obj: Record<string, any>,
        schema: ValidationSchema
    ): ValidationResult {
        const errors: string[] = [];

        for (const [fieldName, fieldSchema] of Object.entries(schema)) {
            const value = obj[fieldName];

            // 必須フィールドチェック
            if (fieldSchema.required && (value === null || value === undefined || value === '')) {
                errors.push(`${fieldName} is required`);
                continue;
            }

            // 値が存在しない場合はスキップ
            if (value === null || value === undefined || value === '') {
                continue;
            }

            // 型チェック
            if (fieldSchema.type) {
                const actualType = Array.isArray(value) ? 'array' : typeof value;
                if (actualType !== fieldSchema.type) {
                    errors.push(`${fieldName} must be of type ${fieldSchema.type}`);
                    continue;
                }
            }

            // カスタムバリデーター実行
            if (fieldSchema.validator) {
                const result = fieldSchema.validator(value, fieldName);
                if (!result.isValid) {
                    errors.push(...result.errors);
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * ファイル拡張子の検証
     * @param filename ファイル名
     * @param allowedExtensions 許可する拡張子の配列
     * @param fieldName フィールド名
     * @returns 検証結果
     */
    static validateFileExtension(
        filename: string,
        allowedExtensions: string[],
        fieldName: string = 'File'
    ): ValidationResult {
        if (!filename || typeof filename !== 'string') {
            return {
                isValid: false,
                errors: [`${fieldName} name is required`]
            };
        }

        const extension = filename.toLowerCase().split('.').pop();
        const normalizedExtensions = allowedExtensions.map(ext => 
            ext.toLowerCase().replace(/^\./, '')
        );

        if (!extension || !normalizedExtensions.includes(extension)) {
            return {
                isValid: false,
                errors: [`${fieldName} must have one of the following extensions: ${allowedExtensions.join(', ')}`]
            };
        }

        return { isValid: true, errors: [] };
    }
}

/**
 * 検証結果型定義
 */
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    parsedValue?: any;
}

/**
 * フィールドスキーマ型定義
 */
export interface FieldSchema {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
    validator?: (value: any, fieldName: string) => ValidationResult;
}

/**
 * バリデーションスキーマ型定義
 */
export interface ValidationSchema {
    [fieldName: string]: FieldSchema;
}