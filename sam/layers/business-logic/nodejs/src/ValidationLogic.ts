/**
 * バリデーション共通ビジネスロジック（Lambda Layer）
 * バリデーション処理に関する共通的なビジネスロジック
 */
import { ValidationUtils, ValidationResult } from '/opt/nodejs/src/ValidationUtils';
import { StringUtils } from '/opt/nodejs/src/StringUtils';
import { DateUtils } from '/opt/nodejs/src/DateUtils';

export class ValidationLogic {
    
    /**
     * CSV行データの包括的バリデーション
     * @param rowData 行データ
     * @param schema バリデーションスキーマ
     * @param rowIndex 行インデックス（エラーメッセージ用）
     * @returns バリデーション結果
     */
    static validateCsvRow(
        rowData: string[],
        schema: CsvRowSchema,
        rowIndex: number = 0
    ): CsvRowValidationResult {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];
        const validatedData: Record<string, any> = {};

        // 列数チェック
        if (rowData.length !== schema.columns.length) {
            errors.push({
                type: 'COLUMN_COUNT_MISMATCH',
                message: `Expected ${schema.columns.length} columns, but got ${rowData.length}`,
                rowIndex,
                columnIndex: -1,
                value: rowData.length,
                severity: 'error'
            });
        }

        // 各列のバリデーション
        schema.columns.forEach((columnSchema, columnIndex) => {
            const value = rowData[columnIndex];
            const fieldName = columnSchema.name || `Column_${columnIndex}`;

            // 必須チェック
            if (columnSchema.required && StringUtils.isEmpty(value)) {
                errors.push({
                    type: 'REQUIRED_FIELD_MISSING',
                    message: `${fieldName} is required`,
                    rowIndex,
                    columnIndex,
                    value,
                    severity: 'error'
                });
                return;
            }

            // 値が空の場合はスキップ（必須チェック以外）
            if (StringUtils.isEmpty(value)) {
                validatedData[fieldName] = null;
                return;
            }

            // データ型別バリデーション
            const typeValidation = this.validateDataType(
                value,
                columnSchema.dataType,
                fieldName,
                rowIndex,
                columnIndex
            );

            if (!typeValidation.isValid) {
                errors.push(...typeValidation.errors);
            } else {
                validatedData[fieldName] = typeValidation.convertedValue;
            }

            // カスタムバリデーター実行
            if (columnSchema.customValidator) {
                const customResult = columnSchema.customValidator(value, fieldName);
                if (!customResult.isValid) {
                    errors.push(...customResult.errors.map(err => ({
                        type: 'CUSTOM_VALIDATION_FAILED',
                        message: err,
                        rowIndex,
                        columnIndex,
                        value,
                        severity: 'error' as const
                    })));
                }
            }

            // 警告レベルのチェック
            const warningChecks = this.performWarningChecks(
                value,
                columnSchema,
                fieldName,
                rowIndex,
                columnIndex
            );
            warnings.push(...warningChecks);
        });

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            validatedData,
            rowIndex,
            metadata: {
                processingTime: Date.now(),
                columnsProcessed: schema.columns.length,
                errorCount: errors.length,
                warningCount: warnings.length
            }
        };
    }

    /**
     * データ型別バリデーション
     * @param value 値
     * @param dataType データ型
     * @param fieldName フィールド名
     * @param rowIndex 行インデックス
     * @param columnIndex 列インデックス
     * @returns 型バリデーション結果
     */
    private static validateDataType(
        value: string,
        dataType: CsvDataType,
        fieldName: string,
        rowIndex: number,
        columnIndex: number
    ): {
        isValid: boolean;
        errors: ValidationError[];
        convertedValue: any;
    } {
        const errors: ValidationError[] = [];
        let convertedValue: any = value;

        switch (dataType) {
            case 'string':
                // 文字列は基本的にそのまま（追加チェックは後で）
                convertedValue = StringUtils.trim(value);
                break;

            case 'number':
                const numValue = parseFloat(value);
                if (isNaN(numValue)) {
                    errors.push({
                        type: 'INVALID_NUMBER_FORMAT',
                        message: `${fieldName} must be a valid number`,
                        rowIndex,
                        columnIndex,
                        value,
                        severity: 'error'
                    });
                } else {
                    convertedValue = numValue;
                }
                break;

            case 'integer':
                const intValue = parseInt(value, 10);
                if (isNaN(intValue) || !Number.isInteger(parseFloat(value))) {
                    errors.push({
                        type: 'INVALID_INTEGER_FORMAT',
                        message: `${fieldName} must be a valid integer`,
                        rowIndex,
                        columnIndex,
                        value,
                        severity: 'error'
                    });
                } else {
                    convertedValue = intValue;
                }
                break;

            case 'boolean':
                const lowerValue = value.toLowerCase();
                if (['true', '1', 'yes', 'y'].includes(lowerValue)) {
                    convertedValue = true;
                } else if (['false', '0', 'no', 'n'].includes(lowerValue)) {
                    convertedValue = false;
                } else {
                    errors.push({
                        type: 'INVALID_BOOLEAN_FORMAT',
                        message: `${fieldName} must be a valid boolean (true/false, 1/0, yes/no)`,
                        rowIndex,
                        columnIndex,
                        value,
                        severity: 'error'
                    });
                }
                break;

            case 'date':
                const dateResult = ValidationUtils.validateDate(value, fieldName);
                if (!dateResult.isValid) {
                    errors.push({
                        type: 'INVALID_DATE_FORMAT',
                        message: dateResult.errors[0],
                        rowIndex,
                        columnIndex,
                        value,
                        severity: 'error'
                    });
                } else {
                    convertedValue = dateResult.parsedValue;
                }
                break;

            case 'email':
                const emailResult = ValidationUtils.validateEmail(value, fieldName);
                if (!emailResult.isValid) {
                    errors.push({
                        type: 'INVALID_EMAIL_FORMAT',
                        message: emailResult.errors[0],
                        rowIndex,
                        columnIndex,
                        value,
                        severity: 'error'
                    });
                }
                break;

            case 'url':
                const urlResult = ValidationUtils.validateUrl(value, fieldName);
                if (!urlResult.isValid) {
                    errors.push({
                        type: 'INVALID_URL_FORMAT',
                        message: urlResult.errors[0],
                        rowIndex,
                        columnIndex,
                        value,
                        severity: 'error'
                    });
                }
                break;

            case 'uuid':
                const uuidResult = ValidationUtils.validateUuid(value, fieldName);
                if (!uuidResult.isValid) {
                    errors.push({
                        type: 'INVALID_UUID_FORMAT',
                        message: uuidResult.errors[0],
                        rowIndex,
                        columnIndex,
                        value,
                        severity: 'error'
                    });
                }
                break;

            default:
                // 未知の型は文字列として扱う
                convertedValue = StringUtils.trim(value);
                break;
        }

        return {
            isValid: errors.length === 0,
            errors,
            convertedValue
        };
    }

    /**
     * 警告レベルのチェック実行
     * @param value 値
     * @param columnSchema 列スキーマ
     * @param fieldName フィールド名
     * @param rowIndex 行インデックス
     * @param columnIndex 列インデックス
     * @returns 警告配列
     */
    private static performWarningChecks(
        value: string,
        columnSchema: CsvColumnSchema,
        fieldName: string,
        rowIndex: number,
        columnIndex: number
    ): ValidationWarning[] {
        const warnings: ValidationWarning[] = [];

        // 長さチェック（推奨範囲）
        if (columnSchema.recommendedLength) {
            const { min, max } = columnSchema.recommendedLength;
            if (value.length < min) {
                warnings.push({
                    type: 'LENGTH_BELOW_RECOMMENDED',
                    message: `${fieldName} is shorter than recommended (${value.length} < ${min})`,
                    rowIndex,
                    columnIndex,
                    value,
                    severity: 'warning'
                });
            } else if (value.length > max) {
                warnings.push({
                    type: 'LENGTH_ABOVE_RECOMMENDED',
                    message: `${fieldName} is longer than recommended (${value.length} > ${max})`,
                    rowIndex,
                    columnIndex,
                    value,
                    severity: 'warning'
                });
            }
        }

        // 数値範囲チェック（推奨範囲）
        if ((columnSchema.dataType === 'number' || columnSchema.dataType === 'integer') && 
            columnSchema.recommendedRange) {
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
                const { min, max } = columnSchema.recommendedRange;
                if (numValue < min) {
                    warnings.push({
                        type: 'VALUE_BELOW_RECOMMENDED',
                        message: `${fieldName} is below recommended range (${numValue} < ${min})`,
                        rowIndex,
                        columnIndex,
                        value,
                        severity: 'warning'
                    });
                } else if (numValue > max) {
                    warnings.push({
                        type: 'VALUE_ABOVE_RECOMMENDED',
                        message: `${fieldName} is above recommended range (${numValue} > ${max})`,
                        rowIndex,
                        columnIndex,
                        value,
                        severity: 'warning'
                    });
                }
            }
        }

        // パターンチェック（推奨パターン）
        if (columnSchema.recommendedPattern && !columnSchema.recommendedPattern.test(value)) {
            warnings.push({
                type: 'PATTERN_MISMATCH_WARNING',
                message: `${fieldName} does not match recommended pattern`,
                rowIndex,
                columnIndex,
                value,
                severity: 'warning'
            });
        }

        // 文字エンコーディングチェック
        if (this.hasEncodingIssues(value)) {
            warnings.push({
                type: 'ENCODING_ISSUE',
                message: `${fieldName} may have character encoding issues`,
                rowIndex,
                columnIndex,
                value,
                severity: 'warning'
            });
        }

        return warnings;
    }

    /**
     * エンコーディング問題の検出
     * @param value 値
     * @returns エンコーディング問題があるかどうか
     */
    private static hasEncodingIssues(value: string): boolean {
        // 置換文字（�）の検出
        if (value.includes('\uFFFD')) {
            return true;
        }

        // 不自然な文字コードの検出
        const suspiciousChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/;
        return suspiciousChars.test(value);
    }

    /**
     * バリデーション結果のマージ
     * @param results バリデーション結果配列
     * @returns マージされたバリデーション結果
     */
    static mergeValidationResults(results: CsvRowValidationResult[]): {
        overallValid: boolean;
        totalErrors: number;
        totalWarnings: number;
        errorsByType: Record<string, number>;
        warningsByType: Record<string, number>;
        validRows: number;
        totalRows: number;
        validationRate: number;
    } {
        let totalErrors = 0;
        let totalWarnings = 0;
        let validRows = 0;
        const errorsByType: Record<string, number> = {};
        const warningsByType: Record<string, number> = {};

        results.forEach(result => {
            totalErrors += result.errors.length;
            totalWarnings += result.warnings.length;
            
            if (result.isValid) {
                validRows++;
            }

            // エラータイプ別集計
            result.errors.forEach(error => {
                errorsByType[error.type] = (errorsByType[error.type] || 0) + 1;
            });

            // 警告タイプ別集計
            result.warnings.forEach(warning => {
                warningsByType[warning.type] = (warningsByType[warning.type] || 0) + 1;
            });
        });

        const totalRows = results.length;
        const validationRate = totalRows > 0 ? (validRows / totalRows) * 100 : 0;

        return {
            overallValid: totalErrors === 0,
            totalErrors,
            totalWarnings,
            errorsByType,
            warningsByType,
            validRows,
            totalRows,
            validationRate: Math.round(validationRate * 100) / 100
        };
    }

    /**
     * ユーザーIDバリデーション（プロジェクト固有）
     * @param userId ユーザーID
     * @param fieldName フィールド名
     * @returns バリデーション結果
     */
    static validateUserId(userId: string, fieldName: string = 'User ID'): ValidationResult {
        const USER_ID_PATTERN = /^U\d{5}$/;
        
        if (!userId || typeof userId !== 'string') {
            return {
                isValid: false,
                errors: [`${fieldName} is required`]
            };
        }

        if (!USER_ID_PATTERN.test(userId)) {
            return {
                isValid: false,
                errors: [`${fieldName} must be in format U00001-U99999`]
            };
        }

        // 範囲チェック
        const numericPart = parseInt(userId.substring(1), 10);
        if (numericPart < 1 || numericPart > 99999) {
            return {
                isValid: false,
                errors: [`${fieldName} number must be between 00001 and 99999`]
            };
        }

        return { isValid: true, errors: [] };
    }

    /**
     * 金額フィールドバリデーション（プロジェクト固有）
     * @param amount 金額
     * @param fieldName フィールド名
     * @returns バリデーション結果
     */
    static validateAmount(amount: string, fieldName: string = 'Amount'): ValidationResult {
        if (!amount || typeof amount !== 'string') {
            return {
                isValid: false,
                errors: [`${fieldName} is required`]
            };
        }

        const numericValue = parseFloat(amount);
        
        if (isNaN(numericValue)) {
            return {
                isValid: false,
                errors: [`${fieldName} must be a valid number`]
            };
        }

        if (numericValue < 0) {
            return {
                isValid: false,
                errors: [`${fieldName} cannot be negative`]
            };
        }

        if (numericValue > 999999999.99) {
            return {
                isValid: false,
                errors: [`${fieldName} exceeds maximum allowed value`]
            };
        }

        // 小数点以下2桁チェック
        const decimalMatch = amount.match(/\.(\d+)$/);
        if (decimalMatch && decimalMatch[1].length > 2) {
            return {
                isValid: false,
                errors: [`${fieldName} can have at most 2 decimal places`]
            };
        }

        return { isValid: true, errors: [] };
    }
}

// 型定義
export type CsvDataType = 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'email' | 'url' | 'uuid';

export interface CsvColumnSchema {
    name: string;
    dataType: CsvDataType;
    required: boolean;
    recommendedLength?: { min: number; max: number };
    recommendedRange?: { min: number; max: number };
    recommendedPattern?: RegExp;
    customValidator?: (value: string, fieldName: string) => ValidationResult;
}

export interface CsvRowSchema {
    columns: CsvColumnSchema[];
}

export interface ValidationError {
    type: string;
    message: string;
    rowIndex: number;
    columnIndex: number;
    value: any;
    severity: 'error';
}

export interface ValidationWarning {
    type: string;
    message: string;
    rowIndex: number;
    columnIndex: number;
    value: any;
    severity: 'warning';
}

export interface CsvRowValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    validatedData: Record<string, any>;
    rowIndex: number;
    metadata: {
        processingTime: number;
        columnsProcessed: number;
        errorCount: number;
        warningCount: number;
    };
}