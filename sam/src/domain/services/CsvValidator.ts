import { Logger } from '@aws-lambda-powertools/logger';
import { CsvFile } from '../models/CsvFile';
import { ValidationError, ErrorType } from '../errors/DomainErrors';
import { BaseError } from '../errors/BaseError';

const logger = new Logger({ serviceName: 'CsvValidator' });

/**
 * CSV検証サービス（ドメイン層）
 * CSV形式、ヘッダー、データ形式の検証を実行
 * 設計書準拠: 03-06_詳細設計書_CSV検証関数.md
 */
export class CsvValidator {
    private static readonly USER_ID_PATTERN = /^U\d{5}$/;
    private static readonly EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    private static readonly MAX_FILE_SIZE_MB = 100;
    private static readonly EXPECTED_HEADERS = ['userId', 'loginCount', 'postCount'];
    
    /**
     * CSVファイル全体の検証
     * @param csvFile CSVファイルオブジェクト
     * @param options 検証オプション
     * @returns 検証結果
     */
    async validateCsvFile(
        csvFile: CsvFile,
        options: ValidationOptions = {}
    ): Promise<CsvValidationResult> {
        const startTime = Date.now();
        const errors: CsvValidationError[] = [];
        const warnings: CsvValidationError[] = [];
        
        logger.info('Starting CSV validation', {
            bucketName: csvFile.bucketName,
            objectKey: csvFile.objectKey,
            options
        });

        try {
            // 1. ファイルサイズ検証
            const fileSizeResult = this.validateFileSize(csvFile);
            if (!fileSizeResult.isValid) {
                errors.push(...fileSizeResult.errors);
                if (options.strictMode !== false) {
                    throw new ValidationError(
                        'File size validation failed',
                        [{ field: 'fileSize', message: `File size ${csvFile.fileSize} bytes exceeds maximum allowed size` }]
                    );
                }
            }

            // 2. CSVパース
            const parseResult = this.parseCsvContent(csvFile.content);
            if (!parseResult.isValid) {
                errors.push(...parseResult.errors);
                if (options.strictMode !== false) {
                    throw new ValidationError('CSV parsing failed');
                }
            }

            const { header, rows } = parseResult;
            
            // 3. ヘッダー検証
            if (!options.skipHeaderValidation) {
                const headerResult = this.validateHeader(header);
                if (!headerResult.isValid) {
                    errors.push(...headerResult.errors);
                    if (options.strictMode !== false) {
                        throw new ValidationError('Header validation failed');
                    }
                }
            }

            // 4. データ行検証
            const dataResult = await this.validateDataRows(
                rows, 
                header, 
                options
            );
            errors.push(...dataResult.errors);
            warnings.push(...dataResult.warnings);

            // 5. 統計情報計算
            const statistics = this.calculateStatistics(rows, header);

            const processingTime = Date.now() - startTime;
            const isValid = errors.length === 0;

            logger.info('CSV validation completed', {
                isValid,
                errorCount: errors.length,
                warningCount: warnings.length,
                totalRows: rows.length,
                processingTimeMs: processingTime
            });

            return {
                isValid,
                errors,
                warnings,
                statistics: {
                    ...statistics,
                    fileSize: csvFile.fileSize,
                    fileSizeMB: (csvFile.fileSize / (1024 * 1024)).toFixed(2),
                    encoding: 'UTF-8',
                    processedAt: new Date().toISOString(),
                    processingTimeMs: processingTime
                },
                metadata: {
                    bucket: csvFile.bucketName,
                    key: csvFile.objectKey,
                    totalRows: rows.length,
                    validRows: rows.length - errors.filter(e => e.line).length
                }
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            
            logger.error('CSV validation failed with exception', {
                error: error instanceof Error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : error,
                processingTimeMs: processingTime
            });

            // 部分的な結果を返す
            return {
                isValid: false,
                errors: [...errors, this.createErrorFromException(error)],
                warnings,
                statistics: {
                    totalRows: 0,
                    validRows: 0,
                    fileSize: csvFile.fileSize,
                    fileSizeMB: (csvFile.fileSize / (1024 * 1024)).toFixed(2),
                    encoding: 'UTF-8',
                    processedAt: new Date().toISOString(),
                    processingTimeMs: processingTime,
                    columnStats: {}
                },
                metadata: {
                    bucket: csvFile.bucketName,
                    key: csvFile.objectKey,
                    totalRows: 0,
                    validRows: 0
                }
            };
        }
    }

    /**
     * ファイルサイズ検証
     */
    private validateFileSize(csvFile: CsvFile): ValidationStepResult {
        const fileSize = csvFile.fileSize;
        const maxSizeBytes = CsvValidator.MAX_FILE_SIZE_MB * 1024 * 1024;

        if (fileSize > maxSizeBytes) {
            return {
                isValid: false,
                errors: [{
                    type: 'FILE_TOO_LARGE' as ErrorType,
                    severity: 'error',
                    code: 'CSV_FILE_TOO_LARGE',
                    message: `File size ${fileSize} bytes exceeds limit of ${CsvValidator.MAX_FILE_SIZE_MB}MB`,
                    details: { fileSize, maxSize: maxSizeBytes }
                }]
            };
        }

        return { isValid: true, errors: [] };
    }

    /**
     * CSVコンテンツのパース
     */
    private parseCsvContent(content: string): ParseResult {
        try {
            const lines = content.split('\n').filter(line => line.trim() !== '');
            
            if (lines.length === 0) {
                return {
                    isValid: false,
                    errors: [{
                        type: 'MALFORMED_CSV' as ErrorType,
                        severity: 'error',
                        code: 'CSV_EMPTY_FILE',
                        message: 'CSV file is empty'
                    }]
                };
            }

            // ヘッダー行
            const header = lines[0].split(',').map(col => col.trim());
            
            // データ行
            const rows: CsvRow[] = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                const cells = line.split(',').map(cell => cell.trim());
                
                const row: CsvRow = {};
                header.forEach((col, index) => {
                    row[col] = cells[index] || '';
                });
                
                rows.push(row);
            }

            return {
                isValid: true,
                errors: [],
                header,
                rows
            };

        } catch (error) {
            return {
                isValid: false,
                errors: [{
                    type: 'MALFORMED_CSV' as ErrorType,
                    severity: 'error',
                    code: 'CSV_PARSE_ERROR',
                    message: `Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`
                }]
            };
        }
    }

    /**
     * ヘッダー検証
     */
    private validateHeader(header: string[]): ValidationStepResult {
        const errors: CsvValidationError[] = [];

        // 必須列の存在確認
        for (const expectedCol of CsvValidator.EXPECTED_HEADERS) {
            if (!header.includes(expectedCol)) {
                errors.push({
                    type: 'MISSING_HEADER' as ErrorType,
                    severity: 'error',
                    code: 'CSV_MISSING_HEADER',
                    message: `Missing required header: ${expectedCol}`,
                    column: expectedCol
                });
            }
        }

        // 重複ヘッダーチェック
        const duplicates = header.filter((item, index) => header.indexOf(item) !== index);
        if (duplicates.length > 0) {
            errors.push({
                type: 'INVALID_HEADER' as ErrorType,
                severity: 'error',
                code: 'CSV_DUPLICATE_HEADERS',
                message: `Duplicate headers found: ${duplicates.join(', ')}`
            });
        }

        // 空のヘッダーチェック
        const emptyHeaders = header.filter(h => !h || h.trim() === '');
        if (emptyHeaders.length > 0) {
            errors.push({
                type: 'INVALID_HEADER' as ErrorType,
                severity: 'error',
                code: 'CSV_EMPTY_HEADERS',
                message: 'Empty header columns found'
            });
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: []
        };
    }

    /**
     * データ行検証
     */
    private async validateDataRows(
        rows: CsvRow[],
        header: string[],
        options: ValidationOptions
    ): Promise<ValidationStepResult> {
        const errors: CsvValidationError[] = [];
        const warnings: CsvValidationError[] = [];
        const maxErrors = options.maxErrors || 100;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const lineNumber = i + 2; // +1 for 0-based, +1 for header

            // 行ごとの検証
            const rowResult = this.validateRow(row, header, lineNumber);
            errors.push(...rowResult.errors);
            warnings.push(...rowResult.warnings);

            // エラー上限チェック
            if (errors.length >= maxErrors) {
                errors.push({
                    type: 'MALFORMED_CSV' as ErrorType,
                    severity: 'error',
                    code: 'CSV_TOO_MANY_ERRORS',
                    message: `Validation stopped: Error limit of ${maxErrors} exceeded`,
                    line: lineNumber
                });
                break;
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * 単一行の検証
     */
    private validateRow(
        row: CsvRow,
        header: string[],
        lineNumber: number
    ): ValidationStepResult {
        const errors: CsvValidationError[] = [];
        const warnings: CsvValidationError[] = [];

        // フィールド数チェック
        const actualFields = Object.keys(row).length;
        const expectedFields = header.length;
        
        if (actualFields !== expectedFields) {
            errors.push({
                type: 'MALFORMED_CSV' as ErrorType,
                severity: 'error',
                code: 'CSV_FIELD_COUNT_MISMATCH',
                message: `Field count mismatch: expected ${expectedFields}, got ${actualFields}`,
                line: lineNumber
            });
        }

        // ユーザーID検証
        if ('userId' in row) {
            const userIdResult = this.validateUserId(row.userId, lineNumber);
            errors.push(...userIdResult.errors);
            warnings.push(...userIdResult.warnings);
        }

        // ログイン回数検証
        if ('loginCount' in row) {
            const loginResult = this.validateNumericField(
                row.loginCount,
                'loginCount',
                lineNumber,
                { allowNegative: false }
            );
            errors.push(...loginResult.errors);
            warnings.push(...loginResult.warnings);
        }

        // 投稿回数検証
        if ('postCount' in row) {
            const postResult = this.validateNumericField(
                row.postCount,
                'postCount',
                lineNumber,
                { allowNegative: false }
            );
            errors.push(...postResult.errors);
            warnings.push(...postResult.warnings);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * ユーザーID検証
     */
    private validateUserId(value: string, lineNumber: number): ValidationStepResult {
        const errors: CsvValidationError[] = [];
        const warnings: CsvValidationError[] = [];

        if (!value || value.trim() === '') {
            errors.push({
                type: 'EMPTY_FIELD' as ErrorType,
                severity: 'error',
                code: 'CSV_EMPTY_USER_ID',
                message: 'User ID is empty',
                line: lineNumber,
                column: 'userId'
            });
        } else if (!CsvValidator.USER_ID_PATTERN.test(value)) {
            errors.push({
                type: 'INVALID_USER_ID_FORMAT' as ErrorType,
                severity: 'error',
                code: 'CSV_INVALID_USER_ID_FORMAT',
                message: `Invalid user ID format: ${value}. Expected format: U00001`,
                line: lineNumber,
                column: 'userId',
                details: { actualValue: value, expectedPattern: 'U00001' }
            });
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * 数値フィールド検証
     */
    private validateNumericField(
        value: string,
        fieldName: string,
        lineNumber: number,
        options: { allowNegative?: boolean } = {}
    ): ValidationStepResult {
        const errors: CsvValidationError[] = [];
        const warnings: CsvValidationError[] = [];

        if (!value || value.trim() === '') {
            errors.push({
                type: 'EMPTY_FIELD' as ErrorType,
                severity: 'error',
                code: 'CSV_EMPTY_FIELD',
                message: `${fieldName} is empty`,
                line: lineNumber,
                column: fieldName
            });
            return { isValid: false, errors };
        }

        const numValue = Number(value);
        
        if (isNaN(numValue)) {
            errors.push({
                type: 'INVALID_DATA_TYPE' as ErrorType,
                severity: 'error',
                code: 'CSV_INVALID_NUMBER',
                message: `${fieldName} is not a valid number: ${value}`,
                line: lineNumber,
                column: fieldName,
                details: { actualValue: value, expectedType: 'number' }
            });
        } else if (!options.allowNegative && numValue < 0) {
            errors.push({
                type: 'NEGATIVE_VALUE' as ErrorType,
                severity: 'error',
                code: 'CSV_NEGATIVE_VALUE',
                message: `${fieldName} cannot be negative: ${value}`,
                line: lineNumber,
                column: fieldName,
                details: { actualValue: value, constraint: 'non-negative' }
            });
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * 統計情報計算
     */
    private calculateStatistics(rows: CsvRow[], header: string[]): CsvStatistics {
        const stats: CsvStatistics = {
            totalRows: rows.length,
            validRows: rows.length, // エラー行は後で減算
            columnStats: {}
        };

        // ユーザーID統計
        if (header.includes('userId')) {
            const userIds = rows
                .map(row => row.userId)
                .filter(id => id && CsvValidator.USER_ID_PATTERN.test(id));
            
            stats.columnStats.userId = {
                uniqueCount: new Set(userIds).size,
                nullCount: rows.filter(row => !row.userId || row.userId.trim() === '').length
            };
        }

        // ログイン回数統計
        if (header.includes('loginCount')) {
            const loginCounts = rows
                .map(row => Number(row.loginCount))
                .filter(count => !isNaN(count) && count >= 0);
            
            stats.columnStats.loginCount = {
                min: loginCounts.length > 0 ? Math.min(...loginCounts) : 0,
                max: loginCounts.length > 0 ? Math.max(...loginCounts) : 0,
                avg: loginCounts.length > 0 ? loginCounts.reduce((a, b) => a + b, 0) / loginCounts.length : 0,
                nullCount: rows.filter(row => !row.loginCount || row.loginCount.trim() === '').length
            };
        }

        // 投稿回数統計
        if (header.includes('postCount')) {
            const postCounts = rows
                .map(row => Number(row.postCount))
                .filter(count => !isNaN(count) && count >= 0);
            
            stats.columnStats.postCount = {
                min: postCounts.length > 0 ? Math.min(...postCounts) : 0,
                max: postCounts.length > 0 ? Math.max(...postCounts) : 0,
                avg: postCounts.length > 0 ? postCounts.reduce((a, b) => a + b, 0) / postCounts.length : 0,
                nullCount: rows.filter(row => !row.postCount || row.postCount.trim() === '').length
            };
        }

        return stats;
    }

    /**
     * 例外からエラーオブジェクトを作成
     */
    private createErrorFromException(error: unknown): CsvValidationError {
        if (error instanceof BaseError) {
            return {
                type: 'MALFORMED_CSV' as ErrorType,
                severity: 'error',
                code: error.code,
                message: error.message
            };
        }
        
        if (error instanceof Error) {
            return {
                type: 'MALFORMED_CSV' as ErrorType,
                severity: 'error',
                code: 'CSV_VALIDATION_ERROR',
                message: error.message
            };
        }

        return {
            type: 'MALFORMED_CSV' as ErrorType,
            severity: 'error',
            code: 'CSV_UNKNOWN_ERROR',
            message: 'Unknown error occurred during validation'
        };
    }
}

/**
 * 検証オプション型定義
 */
export interface ValidationOptions {
    skipHeaderValidation?: boolean;
    strictMode?: boolean;
    maxErrors?: number;
}

/**
 * CSV検証結果型定義
 */
export interface CsvValidationResult {
    isValid: boolean;
    errors: CsvValidationError[];
    warnings: CsvValidationError[];
    statistics: CsvStatisticsWithMeta;
    metadata: CsvValidationMetadata;
}

/**
 * CSV検証エラー型定義
 */
export interface CsvValidationError {
    line?: number;
    column?: string;
    type: ErrorType;
    severity: 'error' | 'warning';
    code: string;
    message: string;
    details?: any;
}

/**
 * CSV統計情報型定義
 */
export interface CsvStatistics {
    totalRows: number;
    validRows: number;
    columnStats: {
        userId?: {
            uniqueCount: number;
            nullCount: number;
        };
        loginCount?: {
            min: number;
            max: number;
            avg: number;
            nullCount: number;
        };
        postCount?: {
            min: number;
            max: number;
            avg: number;
            nullCount: number;
        };
    };
}

/**
 * メタデータ付きCSV統計情報
 */
export interface CsvStatisticsWithMeta extends CsvStatistics {
    fileSize: number;
    fileSizeMB: string;
    encoding: string;
    processedAt: string;
    processingTimeMs: number;
}

/**
 * CSV検証メタデータ型定義
 */
export interface CsvValidationMetadata {
    bucket: string;
    key: string;
    totalRows: number;
    validRows: number;
}

/**
 * 検証ステップ結果型定義
 */
interface ValidationStepResult {
    isValid: boolean;
    errors: CsvValidationError[];
    warnings?: CsvValidationError[];
}

/**
 * CSVパース結果型定義
 */
interface ParseResult extends ValidationStepResult {
    header?: string[];
    rows?: CsvRow[];
}

/**
 * CSV行データ型定義
 */
interface CsvRow {
    [column: string]: string;
}