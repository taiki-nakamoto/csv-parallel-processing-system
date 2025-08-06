/**
 * CSV処理共通ビジネスロジック（Lambda Layer）
 * CSV処理に関する共通的なビジネスロジック
 */
import { StringUtils } from '/opt/nodejs/src/StringUtils';
import { DateUtils } from '/opt/nodejs/src/DateUtils';
import { ValidationUtils } from '/opt/nodejs/src/ValidationUtils';

export class CsvProcessingLogic {
    
    /**
     * CSVデータの前処理（クリーニング）
     * @param csvData CSV行データ
     * @returns クリーニング済みデータ
     */
    static preprocessCsvData(csvData: string[][]): {
        cleanedData: string[][];
        statistics: {
            originalRows: number;
            cleanedRows: number;
            removedEmptyRows: number;
            trimmedFields: number;
        };
    } {
        const originalRows = csvData.length;
        let trimmedFields = 0;
        let removedEmptyRows = 0;

        const cleanedData = csvData
            .filter(row => {
                // 空行の除去
                const isEmpty = row.every(field => StringUtils.isEmpty(field));
                if (isEmpty) {
                    removedEmptyRows++;
                    return false;
                }
                return true;
            })
            .map(row => {
                // フィールドのトリミング
                return row.map(field => {
                    const original = field;
                    const trimmed = StringUtils.trim(field);
                    if (original !== trimmed) {
                        trimmedFields++;
                    }
                    return trimmed;
                });
            });

        return {
            cleanedData,
            statistics: {
                originalRows,
                cleanedRows: cleanedData.length,
                removedEmptyRows,
                trimmedFields
            }
        };
    }

    /**
     * CSVデータのチャンク分割（並列処理用）
     * @param csvData CSVデータ
     * @param chunkSize チャンクサイズ
     * @param includeHeaders ヘッダーを各チャンクに含めるか
     * @returns チャンク分割されたデータ
     */
    static splitIntoChunks(
        csvData: string[][],
        chunkSize: number = 25,
        includeHeaders: boolean = true
    ): {
        chunks: string[][][];
        metadata: {
            totalRows: number;
            totalChunks: number;
            chunkSize: number;
            lastChunkSize: number;
        };
    } {
        if (csvData.length === 0) {
            return {
                chunks: [],
                metadata: {
                    totalRows: 0,
                    totalChunks: 0,
                    chunkSize,
                    lastChunkSize: 0
                }
            };
        }

        const headers = includeHeaders ? csvData[0] : [];
        const dataRows = includeHeaders ? csvData.slice(1) : csvData;
        const chunks: string[][][] = [];

        for (let i = 0; i < dataRows.length; i += chunkSize) {
            const chunkData = dataRows.slice(i, i + chunkSize);
            const chunk = includeHeaders && headers.length > 0 
                ? [headers, ...chunkData]
                : chunkData;
            chunks.push(chunk);
        }

        const lastChunkSize = dataRows.length % chunkSize || chunkSize;

        return {
            chunks,
            metadata: {
                totalRows: csvData.length,
                totalChunks: chunks.length,
                chunkSize,
                lastChunkSize
            }
        };
    }

    /**
     * CSVレコードの重複チェック
     * @param csvData CSVデータ
     * @param keyColumns キーとなる列のインデックス
     * @returns 重複チェック結果
     */
    static checkDuplicates(
        csvData: string[][],
        keyColumns: number[]
    ): {
        hasDuplicates: boolean;
        duplicateGroups: Array<{
            key: string;
            rowIndexes: number[];
            count: number;
        }>;
        uniqueCount: number;
        duplicateCount: number;
    } {
        const keyMap = new Map<string, number[]>();

        csvData.forEach((row, index) => {
            const keyValues = keyColumns.map(colIndex => row[colIndex] || '');
            const key = keyValues.join('|');
            
            if (!keyMap.has(key)) {
                keyMap.set(key, []);
            }
            keyMap.get(key)!.push(index);
        });

        const duplicateGroups: Array<{
            key: string;
            rowIndexes: number[];
            count: number;
        }> = [];

        let uniqueCount = 0;
        let duplicateCount = 0;

        keyMap.forEach((rowIndexes, key) => {
            if (rowIndexes.length > 1) {
                duplicateGroups.push({
                    key,
                    rowIndexes,
                    count: rowIndexes.length
                });
                duplicateCount += rowIndexes.length;
            } else {
                uniqueCount++;
            }
        });

        return {
            hasDuplicates: duplicateGroups.length > 0,
            duplicateGroups,
            uniqueCount,
            duplicateCount
        };
    }

    /**
     * CSVデータの統計情報計算
     * @param csvData CSVデータ
     * @param numericColumns 数値列のインデックス
     * @returns 統計情報
     */
    static calculateStatistics(
        csvData: string[][],
        numericColumns: number[] = []
    ): {
        rowCount: number;
        columnCount: number;
        numericStats: Record<number, {
            column: number;
            count: number;
            sum: number;
            average: number;
            min: number;
            max: number;
            validValues: number;
            invalidValues: number;
        }>;
        textStats: Record<number, {
            column: number;
            uniqueValues: number;
            totalLength: number;
            averageLength: number;
            minLength: number;
            maxLength: number;
            emptyValues: number;
        }>;
    } {
        if (csvData.length === 0) {
            return {
                rowCount: 0,
                columnCount: 0,
                numericStats: {},
                textStats: {}
            };
        }

        const rowCount = csvData.length;
        const columnCount = csvData[0]?.length || 0;

        // 数値統計
        const numericStats: Record<number, any> = {};
        numericColumns.forEach(colIndex => {
            if (colIndex >= columnCount) return;

            const values: number[] = [];
            let validValues = 0;
            let invalidValues = 0;

            csvData.forEach(row => {
                const value = row[colIndex];
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    values.push(numValue);
                    validValues++;
                } else if (value && value.trim() !== '') {
                    invalidValues++;
                }
            });

            if (values.length > 0) {
                const sum = values.reduce((acc, val) => acc + val, 0);
                const average = sum / values.length;
                const min = Math.min(...values);
                const max = Math.max(...values);

                numericStats[colIndex] = {
                    column: colIndex,
                    count: values.length,
                    sum,
                    average: Math.round(average * 100) / 100,
                    min,
                    max,
                    validValues,
                    invalidValues
                };
            }
        });

        // テキスト統計
        const textStats: Record<number, any> = {};
        for (let colIndex = 0; colIndex < columnCount; colIndex++) {
            const values = csvData.map(row => row[colIndex] || '');
            const uniqueValues = new Set(values).size;
            const lengths = values.map(val => val.length);
            const totalLength = lengths.reduce((acc, len) => acc + len, 0);
            const averageLength = totalLength / values.length;
            const minLength = Math.min(...lengths);
            const maxLength = Math.max(...lengths);
            const emptyValues = values.filter(val => val.trim() === '').length;

            textStats[colIndex] = {
                column: colIndex,
                uniqueValues,
                totalLength,
                averageLength: Math.round(averageLength * 100) / 100,
                minLength,
                maxLength,
                emptyValues
            };
        }

        return {
            rowCount,
            columnCount,
            numericStats,
            textStats
        };
    }

    /**
     * CSVデータのサンプリング
     * @param csvData CSVデータ
     * @param sampleSize サンプルサイズ
     * @param method サンプリング方法
     * @returns サンプリング済みデータ
     */
    static sampleData(
        csvData: string[][],
        sampleSize: number,
        method: 'random' | 'systematic' | 'stratified' = 'systematic'
    ): {
        sample: string[][];
        sampleIndexes: number[];
        sampleRate: number;
    } {
        if (csvData.length === 0 || sampleSize <= 0) {
            return {
                sample: [],
                sampleIndexes: [],
                sampleRate: 0
            };
        }

        const actualSampleSize = Math.min(sampleSize, csvData.length);
        const sampleIndexes: number[] = [];
        
        switch (method) {
            case 'random':
                // ランダムサンプリング
                const shuffledIndexes = Array.from(
                    { length: csvData.length }, 
                    (_, i) => i
                ).sort(() => Math.random() - 0.5);
                sampleIndexes.push(...shuffledIndexes.slice(0, actualSampleSize));
                break;

            case 'systematic':
                // 系統サンプリング
                const interval = Math.floor(csvData.length / actualSampleSize);
                for (let i = 0; i < actualSampleSize; i++) {
                    sampleIndexes.push(i * interval);
                }
                break;

            case 'stratified':
                // 層化サンプリング（簡易版：先頭、中間、末尾から均等に）
                const stratumSize = Math.floor(actualSampleSize / 3);
                const remainder = actualSampleSize % 3;
                
                // 先頭から
                for (let i = 0; i < stratumSize + (remainder > 0 ? 1 : 0); i++) {
                    sampleIndexes.push(i);
                }
                
                // 中間から
                const midStart = Math.floor((csvData.length - stratumSize) / 2);
                for (let i = 0; i < stratumSize + (remainder > 1 ? 1 : 0); i++) {
                    sampleIndexes.push(midStart + i);
                }
                
                // 末尾から
                for (let i = 0; i < stratumSize; i++) {
                    sampleIndexes.push(csvData.length - stratumSize + i);
                }
                break;
        }

        const sample = sampleIndexes.map(index => csvData[index]);
        const sampleRate = actualSampleSize / csvData.length;

        return {
            sample,
            sampleIndexes: sampleIndexes.sort((a, b) => a - b),
            sampleRate: Math.round(sampleRate * 10000) / 100 // パーセント表示
        };
    }

    /**
     * データ品質スコアの計算
     * @param csvData CSVデータ
     * @param requiredColumns 必須列のインデックス
     * @param numericColumns 数値列のインデックス
     * @returns 品質スコア
     */
    static calculateDataQualityScore(
        csvData: string[][],
        requiredColumns: number[] = [],
        numericColumns: number[] = []
    ): {
        overallScore: number;
        grade: 'A' | 'B' | 'C' | 'D' | 'F';
        completeness: number;
        validity: number;
        consistency: number;
        details: {
            emptyRequiredFields: number;
            invalidNumericValues: number;
            duplicateRows: number;
            totalRows: number;
            totalFields: number;
        };
        recommendations: string[];
    } {
        if (csvData.length === 0) {
            return {
                overallScore: 0,
                grade: 'F',
                completeness: 0,
                validity: 0,
                consistency: 0,
                details: {
                    emptyRequiredFields: 0,
                    invalidNumericValues: 0,
                    duplicateRows: 0,
                    totalRows: 0,
                    totalFields: 0
                },
                recommendations: ['No data available for quality assessment']
            };
        }

        const totalRows = csvData.length;
        const totalColumns = csvData[0]?.length || 0;
        const totalFields = totalRows * totalColumns;

        // 完整性チェック（必須フィールドの空チェック）
        let emptyRequiredFields = 0;
        requiredColumns.forEach(colIndex => {
            csvData.forEach(row => {
                if (StringUtils.isEmpty(row[colIndex])) {
                    emptyRequiredFields++;
                }
            });
        });

        // 有効性チェック（数値フィールドの形式チェック）
        let invalidNumericValues = 0;
        numericColumns.forEach(colIndex => {
            csvData.forEach(row => {
                const value = row[colIndex];
                if (!StringUtils.isEmpty(value) && isNaN(parseFloat(value))) {
                    invalidNumericValues++;
                }
            });
        });

        // 一貫性チェック（重複行の確認）
        const duplicateCheck = this.checkDuplicates(csvData, Array.from(
            { length: totalColumns }, 
            (_, i) => i
        ));
        const duplicateRows = duplicateCheck.duplicateCount;

        // スコア計算
        const completeness = totalFields > 0 
            ? ((totalFields - emptyRequiredFields) / totalFields) * 100
            : 100;

        const validity = totalFields > 0
            ? ((totalFields - invalidNumericValues) / totalFields) * 100
            : 100;

        const consistency = totalRows > 0
            ? ((totalRows - duplicateRows) / totalRows) * 100
            : 100;

        const overallScore = (completeness + validity + consistency) / 3;

        // グレード判定
        let grade: 'A' | 'B' | 'C' | 'D' | 'F';
        if (overallScore >= 90) grade = 'A';
        else if (overallScore >= 80) grade = 'B';
        else if (overallScore >= 70) grade = 'C';
        else if (overallScore >= 60) grade = 'D';
        else grade = 'F';

        // 推奨事項生成
        const recommendations: string[] = [];
        if (emptyRequiredFields > 0) {
            recommendations.push(`${emptyRequiredFields} required fields are empty`);
        }
        if (invalidNumericValues > 0) {
            recommendations.push(`${invalidNumericValues} invalid numeric values found`);
        }
        if (duplicateRows > 0) {
            recommendations.push(`${duplicateRows} duplicate rows detected`);
        }
        if (overallScore < 70) {
            recommendations.push('Consider data quality improvements before processing');
        }

        return {
            overallScore: Math.round(overallScore * 100) / 100,
            grade,
            completeness: Math.round(completeness * 100) / 100,
            validity: Math.round(validity * 100) / 100,
            consistency: Math.round(consistency * 100) / 100,
            details: {
                emptyRequiredFields,
                invalidNumericValues,
                duplicateRows,
                totalRows,
                totalFields
            },
            recommendations
        };
    }

    /**
     * CSVヘッダーの正規化
     * @param headers ヘッダー配列
     * @returns 正規化済みヘッダー
     */
    static normalizeHeaders(headers: string[]): {
        normalized: string[];
        mapping: Record<string, string>;
        duplicates: string[];
    } {
        const normalized: string[] = [];
        const mapping: Record<string, string> = {};
        const seen = new Set<string>();
        const duplicates: string[] = [];

        headers.forEach(header => {
            const original = header;
            
            // 正規化処理
            let normalized_header = StringUtils.trim(header)
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '_')  // 非英数字をアンダースコアに
                .replace(/_+/g, '_')        // 連続アンダースコアを単一に
                .replace(/^_|_$/g, '');     // 先頭・末尾アンダースコア除去

            // 空または数字のみの場合は代替名を生成
            if (!normalized_header || /^\d+$/.test(normalized_header)) {
                normalized_header = `column_${normalized.length}`;
            }

            // 重複チェック
            if (seen.has(normalized_header)) {
                duplicates.push(original);
                let counter = 1;
                while (seen.has(`${normalized_header}_${counter}`)) {
                    counter++;
                }
                normalized_header = `${normalized_header}_${counter}`;
            }

            normalized.push(normalized_header);
            mapping[original] = normalized_header;
            seen.add(normalized_header);
        });

        return {
            normalized,
            mapping,
            duplicates
        };
    }
}