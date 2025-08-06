import { Logger } from '@aws-lambda-powertools/logger';
import { CsvValidationError } from './CsvValidator';
import { ErrorType } from '../errors/DomainErrors';

const logger = new Logger({ serviceName: 'ValidationRules' });

/**
 * CSV検証ルール定義（ドメイン層）
 * ビジネスルールとカスタムバリデーターの定義
 * 設計書準拠: 03-06_詳細設計書_CSV検証関数.md
 */
export class ValidationRules {
    
    /**
     * ユーザーID検証ルール
     */
    static readonly USER_ID_RULES: ValidationRule<string> = {
        name: 'UserIdValidation',
        description: 'User ID format validation (U00001-U99999)',
        validators: [
            {
                name: 'Required',
                validate: (value: string) => {
                    if (!value || value.trim() === '') {
                        return {
                            isValid: false,
                            error: {
                                type: 'EMPTY_FIELD' as ErrorType,
                                severity: 'error',
                                code: 'USER_ID_REQUIRED',
                                message: 'User ID is required'
                            }
                        };
                    }
                    return { isValid: true };
                }
            },
            {
                name: 'Format',
                validate: (value: string) => {
                    const pattern = /^U\d{5}$/;
                    if (!pattern.test(value)) {
                        return {
                            isValid: false,
                            error: {
                                type: 'INVALID_USER_ID_FORMAT' as ErrorType,
                                severity: 'error',
                                code: 'USER_ID_INVALID_FORMAT',
                                message: `Invalid User ID format: ${value}. Expected format: U00001-U99999`,
                                details: { actualValue: value, expectedPattern: 'U\\d{5}' }
                            }
                        };
                    }
                    return { isValid: true };
                }
            },
            {
                name: 'Range',
                validate: (value: string) => {
                    const match = value.match(/^U(\d{5})$/);
                    if (match) {
                        const numPart = parseInt(match[1], 10);
                        if (numPart < 1 || numPart > 99999) {
                            return {
                                isValid: false,
                                error: {
                                    type: 'INVALID_USER_ID_FORMAT' as ErrorType,
                                    severity: 'error',
                                    code: 'USER_ID_OUT_OF_RANGE',
                                    message: `User ID number out of range: ${numPart}. Valid range: 1-99999`,
                                    details: { actualValue: numPart, validRange: '1-99999' }
                                }
                            };
                        }
                    }
                    return { isValid: true };
                }
            }
        ]
    };

    /**
     * 数値フィールド検証ルール（ログイン・投稿回数用）
     */
    static readonly NUMERIC_FIELD_RULES: ValidationRule<string> = {
        name: 'NumericFieldValidation',
        description: 'Numeric field validation with non-negative constraint',
        validators: [
            {
                name: 'Required',
                validate: (value: string) => {
                    if (!value || value.trim() === '') {
                        return {
                            isValid: false,
                            error: {
                                type: 'EMPTY_FIELD' as ErrorType,
                                severity: 'error',
                                code: 'NUMERIC_FIELD_REQUIRED',
                                message: 'Numeric field is required'
                            }
                        };
                    }
                    return { isValid: true };
                }
            },
            {
                name: 'IsNumeric',
                validate: (value: string) => {
                    const numValue = Number(value);
                    if (isNaN(numValue)) {
                        return {
                            isValid: false,
                            error: {
                                type: 'INVALID_DATA_TYPE' as ErrorType,
                                severity: 'error',
                                code: 'FIELD_NOT_NUMERIC',
                                message: `Value is not a valid number: ${value}`,
                                details: { actualValue: value, expectedType: 'number' }
                            }
                        };
                    }
                    return { isValid: true, parsedValue: numValue };
                }
            },
            {
                name: 'NonNegative',
                validate: (value: string) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue < 0) {
                        return {
                            isValid: false,
                            error: {
                                type: 'NEGATIVE_VALUE' as ErrorType,
                                severity: 'error',
                                code: 'FIELD_NEGATIVE_VALUE',
                                message: `Value cannot be negative: ${value}`,
                                details: { actualValue: numValue, constraint: 'non-negative' }
                            }
                        };
                    }
                    return { isValid: true };
                }
            },
            {
                name: 'IntegerOnly',
                validate: (value: string) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && !Number.isInteger(numValue)) {
                        return {
                            isValid: false,
                            error: {
                                type: 'INVALID_DATA_TYPE' as ErrorType,
                                severity: 'warning',
                                code: 'FIELD_NOT_INTEGER',
                                message: `Value should be an integer: ${value}`,
                                details: { actualValue: numValue, expectedType: 'integer' }
                            }
                        };
                    }
                    return { isValid: true };
                }
            },
            {
                name: 'ReasonableRange',
                validate: (value: string) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                        // ログイン・投稿回数の合理的な上限チェック（警告レベル）
                        const MAX_REASONABLE_COUNT = 10000;
                        if (numValue > MAX_REASONABLE_COUNT) {
                            return {
                                isValid: true, // 警告なので検証は通す
                                warning: {
                                    type: 'INVALID_DATA_TYPE' as ErrorType,
                                    severity: 'warning',
                                    code: 'FIELD_UNUSUALLY_HIGH',
                                    message: `Value is unusually high: ${value}. Please verify.`,
                                    details: { 
                                        actualValue: numValue, 
                                        reasonableMax: MAX_REASONABLE_COUNT 
                                    }
                                }
                            };
                        }
                    }
                    return { isValid: true };
                }
            }
        ]
    };

    /**
     * メールアドレス検証ルール（将来の拡張用）
     */
    static readonly EMAIL_RULES: ValidationRule<string> = {
        name: 'EmailValidation',
        description: 'Email address format validation',
        validators: [
            {
                name: 'Required',
                validate: (value: string) => {
                    if (!value || value.trim() === '') {
                        return {
                            isValid: false,
                            error: {
                                type: 'EMPTY_FIELD' as ErrorType,
                                severity: 'error',
                                code: 'EMAIL_REQUIRED',
                                message: 'Email address is required'
                            }
                        };
                    }
                    return { isValid: true };
                }
            },
            {
                name: 'Format',
                validate: (value: string) => {
                    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailPattern.test(value)) {
                        return {
                            isValid: false,
                            error: {
                                type: 'INVALID_DATA_TYPE' as ErrorType,
                                severity: 'error',
                                code: 'EMAIL_INVALID_FORMAT',
                                message: `Invalid email format: ${value}`,
                                details: { actualValue: value, expectedFormat: 'user@domain.com' }
                            }
                        };
                    }
                    return { isValid: true };
                }
            },
            {
                name: 'Length',
                validate: (value: string) => {
                    const MAX_EMAIL_LENGTH = 254; // RFC 5321準拠
                    if (value.length > MAX_EMAIL_LENGTH) {
                        return {
                            isValid: false,
                            error: {
                                type: 'INVALID_DATA_TYPE' as ErrorType,
                                severity: 'error',
                                code: 'EMAIL_TOO_LONG',
                                message: `Email address too long: ${value.length} characters. Max: ${MAX_EMAIL_LENGTH}`,
                                details: { 
                                    actualLength: value.length, 
                                    maxLength: MAX_EMAIL_LENGTH 
                                }
                            }
                        };
                    }
                    return { isValid: true };
                }
            }
        ]
    };

    /**
     * CSVヘッダー検証ルール
     */
    static readonly HEADER_RULES: ValidationRule<string[]> = {
        name: 'HeaderValidation',
        description: 'CSV header structure validation',
        validators: [
            {
                name: 'RequiredColumns',
                validate: (headers: string[]) => {
                    const requiredHeaders = ['userId', 'loginCount', 'postCount'];
                    const missingHeaders = requiredHeaders.filter(
                        required => !headers.includes(required)
                    );
                    
                    if (missingHeaders.length > 0) {
                        return {
                            isValid: false,
                            error: {
                                type: 'MISSING_HEADER' as ErrorType,
                                severity: 'error',
                                code: 'HEADER_MISSING_REQUIRED',
                                message: `Missing required headers: ${missingHeaders.join(', ')}`,
                                details: { 
                                    missingHeaders, 
                                    requiredHeaders,
                                    actualHeaders: headers 
                                }
                            }
                        };
                    }
                    return { isValid: true };
                }
            },
            {
                name: 'NoDuplicates',
                validate: (headers: string[]) => {
                    const duplicates = headers.filter(
                        (header, index) => headers.indexOf(header) !== index
                    );
                    
                    if (duplicates.length > 0) {
                        return {
                            isValid: false,
                            error: {
                                type: 'INVALID_HEADER' as ErrorType,
                                severity: 'error',
                                code: 'HEADER_DUPLICATES',
                                message: `Duplicate headers found: ${[...new Set(duplicates)].join(', ')}`,
                                details: { duplicates: [...new Set(duplicates)] }
                            }
                        };
                    }
                    return { isValid: true };
                }
            },
            {
                name: 'NoEmptyHeaders',
                validate: (headers: string[]) => {
                    const emptyHeaders = headers.filter(h => !h || h.trim() === '');
                    
                    if (emptyHeaders.length > 0) {
                        return {
                            isValid: false,
                            error: {
                                type: 'INVALID_HEADER' as ErrorType,
                                severity: 'error',
                                code: 'HEADER_EMPTY_COLUMNS',
                                message: `Empty header columns found (count: ${emptyHeaders.length})`,
                                details: { emptyHeaderCount: emptyHeaders.length }
                            }
                        };
                    }
                    return { isValid: true };
                }
            },
            {
                name: 'ReasonableColumnCount',
                validate: (headers: string[]) => {
                    const MAX_REASONABLE_COLUMNS = 50;
                    if (headers.length > MAX_REASONABLE_COLUMNS) {
                        return {
                            isValid: true, // 警告なので検証は通す
                            warning: {
                                type: 'INVALID_HEADER' as ErrorType,
                                severity: 'warning',
                                code: 'HEADER_TOO_MANY_COLUMNS',
                                message: `Large number of columns: ${headers.length}. Performance may be affected.`,
                                details: { 
                                    columnCount: headers.length, 
                                    reasonableMax: MAX_REASONABLE_COLUMNS 
                                }
                            }
                        };
                    }
                    return { isValid: true };
                }
            }
        ]
    };

    /**
     * ファイル全体の検証ルール
     */
    static readonly FILE_RULES: ValidationRule<FileValidationInput> = {
        name: 'FileValidation',
        description: 'File-level validation rules',
        validators: [
            {
                name: 'FileSize',
                validate: (input: FileValidationInput) => {
                    const MAX_SIZE_MB = 100;
                    const maxSizeBytes = MAX_SIZE_MB * 1024 * 1024;
                    
                    if (input.fileSize > maxSizeBytes) {
                        return {
                            isValid: false,
                            error: {
                                type: 'FILE_TOO_LARGE' as ErrorType,
                                severity: 'error',
                                code: 'FILE_SIZE_EXCEEDED',
                                message: `File size ${input.fileSize} bytes exceeds limit of ${MAX_SIZE_MB}MB`,
                                details: { 
                                    actualSize: input.fileSize,
                                    maxSize: maxSizeBytes,
                                    actualSizeMB: (input.fileSize / (1024 * 1024)).toFixed(2)
                                }
                            }
                        };
                    }
                    return { isValid: true };
                }
            },
            {
                name: 'NotEmpty',
                validate: (input: FileValidationInput) => {
                    if (input.rowCount === 0) {
                        return {
                            isValid: false,
                            error: {
                                type: 'MALFORMED_CSV' as ErrorType,
                                severity: 'error',
                                code: 'FILE_EMPTY',
                                message: 'CSV file is empty (no data rows)'
                            }
                        };
                    }
                    return { isValid: true };
                }
            },
            {
                name: 'ReasonableRowCount',
                validate: (input: FileValidationInput) => {
                    const MAX_REASONABLE_ROWS = 1000000; // 100万行
                    if (input.rowCount > MAX_REASONABLE_ROWS) {
                        return {
                            isValid: true, // 警告なので検証は通す
                            warning: {
                                type: 'FILE_TOO_LARGE' as ErrorType,
                                severity: 'warning',
                                code: 'FILE_LARGE_ROW_COUNT',
                                message: `Large file with ${input.rowCount} rows. Processing may take longer.`,
                                details: { 
                                    actualRows: input.rowCount,
                                    reasonableMax: MAX_REASONABLE_ROWS 
                                }
                            }
                        };
                    }
                    return { isValid: true };
                }
            }
        ]
    };

    /**
     * カスタムバリデーターを実行
     * @param value 検証対象の値
     * @param rule 検証ルール
     * @param context 検証コンテキスト
     * @returns 検証結果
     */
    static executeRule<T>(
        value: T,
        rule: ValidationRule<T>,
        context?: ValidationContext
    ): RuleExecutionResult {
        const errors: CsvValidationError[] = [];
        const warnings: CsvValidationError[] = [];

        logger.debug('Executing validation rule', { 
            ruleName: rule.name, 
            validatorCount: rule.validators.length 
        });

        for (const validator of rule.validators) {
            try {
                const result = validator.validate(value);
                
                if (!result.isValid && result.error) {
                    // コンテキスト情報を追加
                    const enrichedError = {
                        ...result.error,
                        line: context?.lineNumber,
                        column: context?.columnName
                    };
                    errors.push(enrichedError);
                }
                
                if (result.warning) {
                    const enrichedWarning = {
                        ...result.warning,
                        line: context?.lineNumber,
                        column: context?.columnName
                    };
                    warnings.push(enrichedWarning);
                }
                
            } catch (error) {
                logger.error('Validator execution failed', {
                    ruleName: rule.name,
                    validatorName: validator.name,
                    error: error instanceof Error ? error.message : String(error)
                });
                
                errors.push({
                    type: 'MALFORMED_CSV' as ErrorType,
                    severity: 'error',
                    code: 'VALIDATOR_EXECUTION_ERROR',
                    message: `Validator execution failed: ${validator.name}`,
                    line: context?.lineNumber,
                    column: context?.columnName,
                    details: { validatorName: validator.name }
                });
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * 複数のルールを組み合わせて実行
     * @param validations 検証定義配列
     * @returns 統合検証結果
     */
    static executeMultipleRules(validations: MultiRuleValidation[]): RuleExecutionResult {
        const allErrors: CsvValidationError[] = [];
        const allWarnings: CsvValidationError[] = [];

        for (const validation of validations) {
            const result = ValidationRules.executeRule(
                validation.value,
                validation.rule,
                validation.context
            );
            
            allErrors.push(...result.errors);
            allWarnings.push(...result.warnings);
        }

        return {
            isValid: allErrors.length === 0,
            errors: allErrors,
            warnings: allWarnings
        };
    }
}

/**
 * 検証ルール型定義
 */
export interface ValidationRule<T> {
    name: string;
    description: string;
    validators: Validator<T>[];
}

/**
 * バリデーター型定義
 */
export interface Validator<T> {
    name: string;
    validate: (value: T) => ValidatorResult;
}

/**
 * バリデーター実行結果型定義
 */
export interface ValidatorResult {
    isValid: boolean;
    error?: CsvValidationError;
    warning?: CsvValidationError;
    parsedValue?: any;
}

/**
 * ルール実行結果型定義
 */
export interface RuleExecutionResult {
    isValid: boolean;
    errors: CsvValidationError[];
    warnings: CsvValidationError[];
}

/**
 * 検証コンテキスト型定義
 */
export interface ValidationContext {
    lineNumber?: number;
    columnName?: string;
    executionId?: string;
    metadata?: Record<string, any>;
}

/**
 * ファイル検証入力型定義
 */
export interface FileValidationInput {
    fileSize: number;
    rowCount: number;
    columnCount: number;
}

/**
 * 複数ルール検証型定義
 */
export interface MultiRuleValidation {
    value: any;
    rule: ValidationRule<any>;
    context?: ValidationContext;
}