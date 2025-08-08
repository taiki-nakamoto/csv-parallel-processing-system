/**
 * データ変換共通ビジネスロジック（Lambda Layer）
 * データ変換処理に関する共通的なビジネスロジック
 */
import { StringUtils } from '/opt/nodejs/src/StringUtils';
import { DateUtils } from '/opt/nodejs/src/DateUtils';
import { FormatConverters } from '/opt/nodejs/src/FormatConverters';

export class DataTransformationLogic {
    
    /**
     * CSVデータの標準化
     * @param csvData CSV行データ
     * @param transformationRules 変換ルール
     * @returns 標準化されたデータ
     */
    static standardizeData(
        csvData: string[][],
        transformationRules: DataTransformationRules
    ): {
        transformedData: string[][];
        transformationLog: TransformationLogEntry[];
        statistics: {
            totalRows: number;
            transformedRows: number;
            totalTransformations: number;
            transformationsByType: Record<string, number>;
        };
    } {
        const transformedData: string[][] = [];
        const transformationLog: TransformationLogEntry[] = [];
        const transformationsByType: Record<string, number> = {};
        let totalTransformations = 0;
        let transformedRowCount = 0;

        csvData.forEach((row, rowIndex) => {
            const transformedRow: string[] = [];
            let rowHasTransformations = false;

            row.forEach((value, colIndex) => {
                let transformedValue = value;
                const originalValue = value;

                // 列別変換ルール適用
                if (transformationRules.columnRules[colIndex]) {
                    const rules = transformationRules.columnRules[colIndex];
                    
                    for (const rule of rules) {
                        const result = this.applyTransformationRule(
                            transformedValue,
                            rule,
                            rowIndex,
                            colIndex
                        );
                        
                        transformedValue = result.transformedValue;
                        
                        if (result.wasTransformed) {
                            transformationLog.push(result.logEntry!);
                            transformationsByType[rule.type] = 
                                (transformationsByType[rule.type] || 0) + 1;
                            totalTransformations++;
                            rowHasTransformations = true;
                        }
                    }
                }

                // グローバル変換ルール適用
                for (const rule of transformationRules.globalRules) {
                    const result = this.applyTransformationRule(
                        transformedValue,
                        rule,
                        rowIndex,
                        colIndex
                    );
                    
                    transformedValue = result.transformedValue;
                    
                    if (result.wasTransformed) {
                        transformationLog.push(result.logEntry!);
                        transformationsByType[rule.type] = 
                            (transformationsByType[rule.type] || 0) + 1;
                        totalTransformations++;
                        rowHasTransformations = true;
                    }
                }

                transformedRow.push(transformedValue);
            });

            if (rowHasTransformations) {
                transformedRowCount++;
            }

            transformedData.push(transformedRow);
        });

        return {
            transformedData,
            transformationLog,
            statistics: {
                totalRows: csvData.length,
                transformedRows: transformedRowCount,
                totalTransformations,
                transformationsByType
            }
        };
    }

    /**
     * 単一変換ルールの適用
     * @param value 値
     * @param rule 変換ルール
     * @param rowIndex 行インデックス
     * @param colIndex 列インデックス
     * @returns 変換結果
     */
    private static applyTransformationRule(
        value: string,
        rule: TransformationRule,
        rowIndex: number,
        colIndex: number
    ): {
        transformedValue: string;
        wasTransformed: boolean;
        logEntry?: TransformationLogEntry;
    } {
        const originalValue = value;
        let transformedValue = value;
        let wasTransformed = false;

        try {
            switch (rule.type) {
                case 'trim':
                    transformedValue = StringUtils.trim(value);
                    wasTransformed = transformedValue !== originalValue;
                    break;

                case 'uppercase':
                    transformedValue = value.toUpperCase();
                    wasTransformed = transformedValue !== originalValue;
                    break;

                case 'lowercase':
                    transformedValue = value.toLowerCase();
                    wasTransformed = transformedValue !== originalValue;
                    break;

                case 'normalize_case':
                    if (rule.parameters?.caseType === 'camel') {
                        transformedValue = StringUtils.snakeToCamel(value.toLowerCase());
                    } else if (rule.parameters?.caseType === 'snake') {
                        transformedValue = StringUtils.camelToSnake(value);
                    } else if (rule.parameters?.caseType === 'pascal') {
                        transformedValue = StringUtils.toPascalCase(value);
                    } else if (rule.parameters?.caseType === 'kebab') {
                        transformedValue = StringUtils.toKebabCase(value);
                    }
                    wasTransformed = transformedValue !== originalValue;
                    break;

                case 'replace':
                    if (rule.parameters?.searchValue && rule.parameters?.replaceValue !== undefined) {
                        transformedValue = StringUtils.replaceAll(
                            value,
                            rule.parameters.searchValue,
                            rule.parameters.replaceValue
                        );
                        wasTransformed = transformedValue !== originalValue;
                    }
                    break;

                case 'regex_replace':
                    if (rule.parameters?.pattern && rule.parameters?.replaceValue !== undefined) {
                        const regex = new RegExp(rule.parameters.pattern, rule.parameters.flags || 'g');
                        transformedValue = value.replace(regex, rule.parameters.replaceValue);
                        wasTransformed = transformedValue !== originalValue;
                    }
                    break;

                case 'format_date':
                    const date = DateUtils.parseDate(value);
                    if (date) {
                        const format = rule.parameters?.format || 'YYYY-MM-DD';
                        transformedValue = DateUtils.formatDate(date, format);
                        wasTransformed = transformedValue !== originalValue;
                    }
                    break;

                case 'format_number':
                    const num = parseFloat(value);
                    if (!isNaN(num)) {
                        const decimals = rule.parameters?.decimals || 2;
                        transformedValue = num.toFixed(decimals);
                        wasTransformed = transformedValue !== originalValue;
                    }
                    break;

                case 'pad_left':
                    if (rule.parameters?.length && rule.parameters?.padChar) {
                        transformedValue = value.padStart(
                            rule.parameters.length,
                            rule.parameters.padChar
                        );
                        wasTransformed = transformedValue !== originalValue;
                    }
                    break;

                case 'pad_right':
                    if (rule.parameters?.length && rule.parameters?.padChar) {
                        transformedValue = value.padEnd(
                            rule.parameters.length,
                            rule.parameters.padChar
                        );
                        wasTransformed = transformedValue !== originalValue;
                    }
                    break;

                case 'mask':
                    if (rule.parameters?.maskChar) {
                        const visibleStart = rule.parameters?.visibleStart || 2;
                        const visibleEnd = rule.parameters?.visibleEnd || 2;
                        transformedValue = StringUtils.mask(
                            value,
                            rule.parameters.maskChar,
                            visibleStart,
                            visibleEnd
                        );
                        wasTransformed = true; // マスキングは常に変換とみなす
                    }
                    break;

                case 'truncate':
                    if (rule.parameters?.maxLength) {
                        const suffix = rule.parameters?.suffix || '...';
                        transformedValue = StringUtils.truncate(
                            value,
                            rule.parameters.maxLength,
                            suffix
                        );
                        wasTransformed = transformedValue !== originalValue;
                    }
                    break;

                case 'default_value':
                    if (StringUtils.isEmpty(value) && rule.parameters?.defaultValue !== undefined) {
                        transformedValue = rule.parameters.defaultValue;
                        wasTransformed = true;
                    }
                    break;

                case 'remove_chars':
                    if (rule.parameters?.charsToRemove) {
                        const pattern = rule.parameters.charsToRemove
                            .split('')
                            .map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                            .join('|');
                        transformedValue = value.replace(new RegExp(pattern, 'g'), '');
                        wasTransformed = transformedValue !== originalValue;
                    }
                    break;

                case 'normalize_whitespace':
                    transformedValue = value.replace(/\s+/g, ' ').trim();
                    wasTransformed = transformedValue !== originalValue;
                    break;

                case 'custom':
                    if (rule.customFunction) {
                        transformedValue = rule.customFunction(value);
                        wasTransformed = transformedValue !== originalValue;
                    }
                    break;
            }

            // 変換ログエントリの作成
            const logEntry: TransformationLogEntry = {
                rowIndex,
                columnIndex: colIndex,
                ruleType: rule.type,
                originalValue,
                transformedValue,
                transformedAt: new Date(),
                success: true
            };

            return {
                transformedValue,
                wasTransformed,
                logEntry: wasTransformed ? logEntry : undefined
            };

        } catch (error) {
            // 変換エラーログ
            const errorLogEntry: TransformationLogEntry = {
                rowIndex,
                columnIndex: colIndex,
                ruleType: rule.type,
                originalValue,
                transformedValue: originalValue, // エラー時は元の値を保持
                transformedAt: new Date(),
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };

            return {
                transformedValue: originalValue,
                wasTransformed: false,
                logEntry: errorLogEntry
            };
        }
    }

    /**
     * データの集約（グループ化と集計）
     * @param csvData CSVデータ
     * @param groupByColumns グループ化する列
     * @param aggregations 集計設定
     * @returns 集約結果
     */
    static aggregateData(
        csvData: string[][],
        groupByColumns: number[],
        aggregations: DataAggregation[]
    ): {
        aggregatedData: string[][];
        metadata: {
            originalRows: number;
            aggregatedRows: number;
            groupCount: number;
            aggregationDetails: Record<string, any>;
        };
    } {
        if (csvData.length === 0) {
            return {
                aggregatedData: [],
                metadata: {
                    originalRows: 0,
                    aggregatedRows: 0,
                    groupCount: 0,
                    aggregationDetails: {}
                }
            };
        }

        // グループ化
        const groups = new Map<string, string[][]>();
        
        csvData.forEach(row => {
            const groupKey = groupByColumns.map(colIndex => row[colIndex] || '').join('|');
            
            if (!groups.has(groupKey)) {
                groups.set(groupKey, []);
            }
            groups.get(groupKey)!.push(row);
        });

        // 集約処理
        const aggregatedData: string[][] = [];
        const aggregationDetails: Record<string, any> = {};

        groups.forEach((groupRows, groupKey) => {
            const aggregatedRow: string[] = [];
            
            // グループキーの値を最初に設定
            const firstRow = groupRows[0];
            groupByColumns.forEach(colIndex => {
                aggregatedRow[colIndex] = firstRow[colIndex] || '';
            });

            // 集約計算
            aggregations.forEach(agg => {
                const values = groupRows.map(row => row[agg.columnIndex]).filter(val => !StringUtils.isEmpty(val));
                let aggregatedValue: string = '';

                switch (agg.type) {
                    case 'count':
                        aggregatedValue = groupRows.length.toString();
                        break;

                    case 'count_non_empty':
                        aggregatedValue = values.length.toString();
                        break;

                    case 'sum':
                        const numericValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
                        aggregatedValue = numericValues.reduce((sum, val) => sum + val, 0).toString();
                        break;

                    case 'average':
                        const avgValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
                        if (avgValues.length > 0) {
                            const avg = avgValues.reduce((sum, val) => sum + val, 0) / avgValues.length;
                            aggregatedValue = avg.toFixed(2);
                        }
                        break;

                    case 'min':
                        const minValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
                        if (minValues.length > 0) {
                            aggregatedValue = Math.min(...minValues).toString();
                        }
                        break;

                    case 'max':
                        const maxValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
                        if (maxValues.length > 0) {
                            aggregatedValue = Math.max(...maxValues).toString();
                        }
                        break;

                    case 'first':
                        aggregatedValue = values.length > 0 ? values[0] : '';
                        break;

                    case 'last':
                        aggregatedValue = values.length > 0 ? values[values.length - 1] : '';
                        break;

                    case 'concat':
                        const delimiter = agg.parameters?.delimiter || ',';
                        aggregatedValue = values.join(delimiter);
                        break;

                    case 'unique_count':
                        const uniqueValues = new Set(values);
                        aggregatedValue = uniqueValues.size.toString();
                        break;
                }

                aggregatedRow[agg.targetColumnIndex || agg.columnIndex] = aggregatedValue;
            });

            aggregatedData.push(aggregatedRow);
        });

        return {
            aggregatedData,
            metadata: {
                originalRows: csvData.length,
                aggregatedRows: aggregatedData.length,
                groupCount: groups.size,
                aggregationDetails
            }
        };
    }

    /**
     * データのピボット変換
     * @param csvData CSVデータ
     * @param pivotConfig ピボット設定
     * @returns ピボット結果
     */
    static pivotData(
        csvData: string[][],
        pivotConfig: PivotConfiguration
    ): {
        pivotedData: string[][];
        newHeaders: string[];
        metadata: {
            originalRows: number;
            originalColumns: number;
            pivotedRows: number;
            pivotedColumns: number;
        };
    } {
        if (csvData.length === 0) {
            return {
                pivotedData: [],
                newHeaders: [],
                metadata: {
                    originalRows: 0,
                    originalColumns: 0,
                    pivotedRows: 0,
                    pivotedColumns: 0
                }
            };
        }

        const originalRows = csvData.length;
        const originalColumns = csvData[0]?.length || 0;

        // ピボット値の収集
        const pivotValues = new Set<string>();
        csvData.forEach(row => {
            const pivotValue = row[pivotConfig.pivotColumn] || '';
            if (!StringUtils.isEmpty(pivotValue)) {
                pivotValues.add(pivotValue);
            }
        });

        // 新しいヘッダーの構築
        const newHeaders: string[] = [];
        
        // インデックス列のヘッダー
        pivotConfig.indexColumns.forEach(colIndex => {
            newHeaders.push(`Column_${colIndex}`);
        });
        
        // ピボット値をヘッダーに追加
        Array.from(pivotValues).sort().forEach(pivotValue => {
            newHeaders.push(pivotValue);
        });

        // グループ化とピボット処理
        const groups = new Map<string, Record<string, string>>();
        
        csvData.forEach(row => {
            const groupKey = pivotConfig.indexColumns
                .map(colIndex => row[colIndex] || '')
                .join('|');
            
            if (!groups.has(groupKey)) {
                groups.set(groupKey, {});
            }
            
            const pivotKey = row[pivotConfig.pivotColumn] || '';
            const value = row[pivotConfig.valueColumn] || '';
            
            if (!StringUtils.isEmpty(pivotKey)) {
                groups.get(groupKey)![pivotKey] = value;
            }
        });

        // ピボットデータの構築
        const pivotedData: string[][] = [];
        
        groups.forEach((pivotValues, groupKey) => {
            const pivotedRow: string[] = [];
            
            // インデックス列の値
            const groupKeyParts = groupKey.split('|');
            pivotedRow.push(...groupKeyParts);
            
            // ピボット値
            Array.from(pivotValues).sort().forEach(pivotValue => {
                pivotedRow.push(pivotValues[pivotValue] || '');
            });
            
            pivotedData.push(pivotedRow);
        });

        return {
            pivotedData,
            newHeaders,
            metadata: {
                originalRows,
                originalColumns,
                pivotedRows: pivotedData.length,
                pivotedColumns: newHeaders.length
            }
        };
    }

    /**
     * データの正規化（スケーリング）
     * @param csvData CSVデータ
     * @param normalizeColumns 正規化対象列
     * @param method 正規化方法
     * @returns 正規化結果
     */
    static normalizeNumericData(
        csvData: string[][],
        normalizeColumns: number[],
        method: 'min-max' | 'z-score' = 'min-max'
    ): {
        normalizedData: string[][];
        normalizationParams: Record<number, {
            min: number;
            max: number;
            mean: number;
            stdDev: number;
        }>;
    } {
        const normalizedData: string[][] = [...csvData];
        const normalizationParams: Record<number, any> = {};

        normalizeColumns.forEach(colIndex => {
            const values = csvData
                .map(row => parseFloat(row[colIndex]))
                .filter(val => !isNaN(val));

            if (values.length === 0) return;

            const min = Math.min(...values);
            const max = Math.max(...values);
            const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
            const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
            const stdDev = Math.sqrt(variance);

            normalizationParams[colIndex] = { min, max, mean, stdDev };

            // 正規化実行
            normalizedData.forEach((row, rowIndex) => {
                const originalValue = parseFloat(row[colIndex]);
                if (!isNaN(originalValue)) {
                    let normalizedValue: number;
                    
                    if (method === 'min-max') {
                        // Min-Max正規化 (0-1範囲)
                        normalizedValue = max === min ? 0 : (originalValue - min) / (max - min);
                    } else {
                        // Z-score正規化 (平均0、標準偏差1)
                        normalizedValue = stdDev === 0 ? 0 : (originalValue - mean) / stdDev;
                    }
                    
                    normalizedData[rowIndex][colIndex] = normalizedValue.toFixed(6);
                }
            });
        });

        return {
            normalizedData,
            normalizationParams
        };
    }
}

// 型定義
export interface TransformationRule {
    type: 'trim' | 'uppercase' | 'lowercase' | 'normalize_case' | 'replace' | 'regex_replace' |
          'format_date' | 'format_number' | 'pad_left' | 'pad_right' | 'mask' | 'truncate' |
          'default_value' | 'remove_chars' | 'normalize_whitespace' | 'custom';
    parameters?: Record<string, any>;
    customFunction?: (value: string) => string;
}

export interface DataTransformationRules {
    globalRules: TransformationRule[];
    columnRules: Record<number, TransformationRule[]>;
}

export interface TransformationLogEntry {
    rowIndex: number;
    columnIndex: number;
    ruleType: string;
    originalValue: string;
    transformedValue: string;
    transformedAt: Date;
    success: boolean;
    error?: string;
}

export interface DataAggregation {
    columnIndex: number;
    type: 'count' | 'count_non_empty' | 'sum' | 'average' | 'min' | 'max' | 
          'first' | 'last' | 'concat' | 'unique_count';
    targetColumnIndex?: number;
    parameters?: Record<string, any>;
}

export interface PivotConfiguration {
    indexColumns: number[];
    pivotColumn: number;
    valueColumn: number;
}