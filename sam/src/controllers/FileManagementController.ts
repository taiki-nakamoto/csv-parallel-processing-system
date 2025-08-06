import { Logger } from '@aws-lambda-powertools/logger';
import { APIGatewayProxyEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import { S3ClientWrapper } from '/opt/nodejs/src/S3ClientWrapper';
import { DynamoDBClientWrapper } from '/opt/nodejs/src/DynamoDBClientWrapper';
import { ValidationUtils } from '/opt/nodejs/src/ValidationUtils';
import { StringUtils } from '/opt/nodejs/src/StringUtils';
import { DateUtils } from '/opt/nodejs/src/DateUtils';
import { DynamoDbAuditRepository } from '@infrastructure/repositories/DynamoDbAuditRepository';
import { AuditLog } from '@domain/models/AuditLog';

const logger = new Logger({ serviceName: 'file-management-controller' });

/**
 * ファイル管理APIコントローラー
 * 設計書: 03-13_詳細設計書_API詳細設計.md Section 6
 */
export class FileManagementController {
    private readonly s3Client: S3ClientWrapper;
    private readonly dynamoClient: DynamoDBClientWrapper;
    private readonly auditRepository: DynamoDbAuditRepository;
    private readonly inputBucketName: string;
    private readonly outputBucketName: string;
    private readonly fileTrackingTableName: string;

    constructor(
        s3Client: S3ClientWrapper,
        dynamoClient: DynamoDBClientWrapper,
        auditRepository: DynamoDbAuditRepository
    ) {
        this.s3Client = s3Client;
        this.dynamoClient = dynamoClient;
        this.auditRepository = auditRepository;
        this.inputBucketName = process.env.INPUT_BUCKET_NAME || '';
        this.outputBucketName = process.env.OUTPUT_BUCKET_NAME || '';
        this.fileTrackingTableName = process.env.FILE_TRACKING_TABLE_NAME || 'file_tracking';

        if (!this.inputBucketName || !this.outputBucketName) {
            throw new Error('INPUT_BUCKET_NAME and OUTPUT_BUCKET_NAME environment variables are required');
        }
    }

    /**
     * アップロードURL生成 API
     * POST /files/upload-url
     */
    async generateUploadUrl(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
        const requestId = context.awsRequestId;
        const startTime = Date.now();

        try {
            logger.info('Generating upload URL', { requestId });

            // リクエストボディのバリデーション
            const requestBody = this.safeParseJson(event.body || '{}');
            const validationResult = this.validateUploadUrlRequest(requestBody);

            if (!validationResult.isValid) {
                return this.createErrorResponse(400, 'VALIDATION_ERROR', 'Invalid request body', {
                    details: validationResult.errors,
                    requestId
                });
            }

            const {
                fileName,
                contentType = 'text/csv',
                expiresIn = 3600,
                metadata = {}
            } = requestBody;

            // ファイルID生成
            const fileId = this.generateFileId(fileName);

            // S3オブジェクトキー生成
            const s3Key = this.generateS3Key(fileName, fileId);

            // 署名付きURL生成
            const uploadUrl = await this.generatePresignedUploadUrl(
                this.inputBucketName,
                s3Key,
                contentType,
                expiresIn,
                metadata
            );

            // ファイル追跡レコード作成
            await this.createFileTrackingRecord({
                fileId,
                fileName,
                s3Bucket: this.inputBucketName,
                s3Key,
                status: 'pending_upload',
                uploadUrl,
                expiresAt: DateUtils.addTime(new Date(), expiresIn, 'seconds'),
                metadata: {
                    ...metadata,
                    requestId,
                    contentType,
                    createdBy: 'API'
                }
            });

            // レスポンス作成
            const responseBody = {
                uploadUrl,
                fileId,
                s3Bucket: this.inputBucketName,
                s3Key,
                expiresAt: DateUtils.addTime(new Date(), expiresIn, 'seconds').toISOString(),
                uploadInstructions: {
                    method: 'PUT',
                    headers: {
                        'Content-Type': contentType
                    }
                }
            };

            // 監査ログ記録
            await this.recordAuditLog({
                executionId: fileId,
                timestamp: new Date(),
                eventType: 'API_UPLOAD_URL_GENERATED',
                logLevel: 'INFO',
                functionName: 'FileManagementController.generateUploadUrl',
                message: 'Upload URL generated successfully',
                metadata: {
                    requestId,
                    fileId,
                    fileName,
                    s3Key,
                    expiresIn,
                    processingTime: Date.now() - startTime
                }
            });

            return this.createSuccessResponse(201, responseBody, requestId);

        } catch (error) {
            logger.error('Failed to generate upload URL', { 
                error: error instanceof Error ? error.message : String(error),
                requestId 
            });

            await this.recordAuditLog({
                executionId: requestId,
                timestamp: new Date(),
                eventType: 'API_UPLOAD_URL_ERROR',
                logLevel: 'ERROR',
                functionName: 'FileManagementController.generateUploadUrl',
                message: 'Failed to generate upload URL',
                metadata: {
                    requestId,
                    error: error instanceof Error ? error.message : String(error),
                    processingTime: Date.now() - startTime
                }
            });

            return this.createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', { requestId });
        }
    }

    /**
     * ファイル処理状態取得 API
     * GET /files/{fileId}/status
     */
    async getFileStatus(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
        const requestId = context.awsRequestId;
        const startTime = Date.now();

        try {
            const fileId = event.pathParameters?.fileId;
            if (!fileId) {
                return this.createErrorResponse(400, 'INVALID_REQUEST', 'File ID is required', { requestId });
            }

            logger.info('Getting file status', { requestId, fileId });

            // ファイル追跡レコード取得
            const fileRecord = await this.dynamoClient.getItem(
                this.fileTrackingTableName,
                { fileId }
            );

            if (!fileRecord) {
                return this.createErrorResponse(404, 'FILE_NOT_FOUND', 'File not found', { requestId });
            }

            // 処理進捗の取得（processing_metadata テーブルから）
            const progressInfo = await this.getProcessingProgress(fileId);

            // レスポンス作成
            const responseBody = {
                fileId: fileRecord.fileId,
                fileName: fileRecord.fileName,
                status: fileRecord.status,
                uploadTime: fileRecord.uploadTime,
                processingStartTime: fileRecord.processingStartTime,
                processingEndTime: fileRecord.processingEndTime,
                executionArn: fileRecord.executionArn,
                progress: progressInfo.progress,
                result: progressInfo.result,
                error: fileRecord.error
            };

            // 監査ログ記録
            await this.recordAuditLog({
                executionId: fileId,
                timestamp: new Date(),
                eventType: 'API_FILE_STATUS',
                logLevel: 'INFO',
                functionName: 'FileManagementController.getFileStatus',
                message: 'File status retrieved successfully',
                metadata: {
                    requestId,
                    fileId,
                    status: fileRecord.status,
                    processingTime: Date.now() - startTime
                }
            });

            return this.createSuccessResponse(200, responseBody, requestId);

        } catch (error) {
            logger.error('Failed to get file status', { 
                error: error instanceof Error ? error.message : String(error),
                requestId 
            });

            return this.createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', { requestId });
        }
    }

    /**
     * 処理結果取得 API
     * GET /files/{fileId}/result
     */
    async getFileResult(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
        const requestId = context.awsRequestId;
        const startTime = Date.now();

        try {
            const fileId = event.pathParameters?.fileId;
            if (!fileId) {
                return this.createErrorResponse(400, 'INVALID_REQUEST', 'File ID is required', { requestId });
            }

            const queryParams = event.queryStringParameters || {};
            const format = queryParams.format || 'json';

            if (!['json', 'csv'].includes(format)) {
                return this.createErrorResponse(400, 'INVALID_REQUEST', 'Format must be json or csv', { requestId });
            }

            logger.info('Getting file result', { requestId, fileId, format });

            // ファイル追跡レコード取得
            const fileRecord = await this.dynamoClient.getItem(
                this.fileTrackingTableName,
                { fileId }
            );

            if (!fileRecord) {
                return this.createErrorResponse(404, 'FILE_NOT_FOUND', 'File not found', { requestId });
            }

            if (fileRecord.status !== 'completed') {
                return this.createErrorResponse(409, 'PROCESSING_IN_PROGRESS', 'File processing not completed', { 
                    requestId,
                    currentStatus: fileRecord.status
                });
            }

            // 処理結果取得
            const processingResult = await this.getProcessingResult(fileId, format);

            if (!processingResult) {
                return this.createErrorResponse(404, 'FILE_NOT_FOUND', 'Processing result not found', { requestId });
            }

            // レスポンス作成
            const responseBody = {
                fileId,
                processingResult: {
                    summary: processingResult.summary,
                    details: processingResult.details,
                    statistics: processingResult.statistics
                }
            };

            // 監査ログ記録
            await this.recordAuditLog({
                executionId: fileId,
                timestamp: new Date(),
                eventType: 'API_FILE_RESULT',
                logLevel: 'INFO',
                functionName: 'FileManagementController.getFileResult',
                message: 'File result retrieved successfully',
                metadata: {
                    requestId,
                    fileId,
                    format,
                    processingTime: Date.now() - startTime
                }
            });

            return this.createSuccessResponse(200, responseBody, requestId);

        } catch (error) {
            logger.error('Failed to get file result', { 
                error: error instanceof Error ? error.message : String(error),
                requestId 
            });

            return this.createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', { requestId });
        }
    }

    /**
     * ファイルダウンロードURL生成 API
     * GET /files/{fileId}/download
     */
    async generateDownloadUrl(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
        const requestId = context.awsRequestId;
        const startTime = Date.now();

        try {
            const fileId = event.pathParameters?.fileId;
            if (!fileId) {
                return this.createErrorResponse(400, 'INVALID_REQUEST', 'File ID is required', { requestId });
            }

            const queryParams = event.queryStringParameters || {};
            const fileType = queryParams.type || 'result'; // result, summary, error_report
            const expiresIn = parseInt(queryParams.expiresIn || '3600', 10);

            logger.info('Generating download URL', { requestId, fileId, fileType });

            // ファイル追跡レコード取得
            const fileRecord = await this.dynamoClient.getItem(
                this.fileTrackingTableName,
                { fileId }
            );

            if (!fileRecord) {
                return this.createErrorResponse(404, 'FILE_NOT_FOUND', 'File not found', { requestId });
            }

            if (fileRecord.status !== 'completed') {
                return this.createErrorResponse(409, 'PROCESSING_IN_PROGRESS', 'File processing not completed', { 
                    requestId,
                    currentStatus: fileRecord.status
                });
            }

            // 出力ファイルのS3キー構築
            const outputS3Key = this.buildOutputS3Key(fileId, fileType);

            // ファイル存在確認
            const fileExists = await this.s3Client.objectExists(this.outputBucketName, outputS3Key);
            if (!fileExists) {
                return this.createErrorResponse(404, 'FILE_NOT_FOUND', `Output file not found: ${fileType}`, { requestId });
            }

            // 署名付きダウンロードURL生成
            const downloadUrl = await this.generatePresignedDownloadUrl(
                this.outputBucketName,
                outputS3Key,
                expiresIn
            );

            // ファイルメタデータ取得
            const fileMetadata = await this.s3Client.headObject(this.outputBucketName, outputS3Key);

            // レスポンス作成
            const responseBody = {
                downloadUrl,
                fileId,
                fileType,
                fileName: `${fileRecord.fileName}_${fileType}.${fileType === 'result' ? 'json' : 'csv'}`,
                contentType: fileMetadata.ContentType || 'application/octet-stream',
                fileSize: fileMetadata.ContentLength || 0,
                expiresAt: DateUtils.addTime(new Date(), expiresIn, 'seconds').toISOString()
            };

            // 監査ログ記録
            await this.recordAuditLog({
                executionId: fileId,
                timestamp: new Date(),
                eventType: 'API_DOWNLOAD_URL_GENERATED',
                logLevel: 'INFO',
                functionName: 'FileManagementController.generateDownloadUrl',
                message: 'Download URL generated successfully',
                metadata: {
                    requestId,
                    fileId,
                    fileType,
                    outputS3Key,
                    expiresIn,
                    processingTime: Date.now() - startTime
                }
            });

            return this.createSuccessResponse(200, responseBody, requestId);

        } catch (error) {
            logger.error('Failed to generate download URL', { 
                error: error instanceof Error ? error.message : String(error),
                requestId 
            });

            return this.createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', { requestId });
        }
    }

    // プライベートメソッド

    /**
     * アップロードURLリクエストバリデーション
     */
    private validateUploadUrlRequest(requestBody: any): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        // fileName バリデーション
        if (!requestBody.fileName || typeof requestBody.fileName !== 'string') {
            errors.push('fileName is required and must be a string');
        } else {
            // ファイル名形式チェック（.csv拡張子）
            if (!/^[a-zA-Z0-9._-]+\.csv$/i.test(requestBody.fileName)) {
                errors.push('fileName must be a valid CSV file name');
            }
            if (requestBody.fileName.length > 255) {
                errors.push('fileName must not exceed 255 characters');
            }
        }

        // contentType バリデーション
        if (requestBody.contentType && typeof requestBody.contentType !== 'string') {
            errors.push('contentType must be a string');
        }

        // expiresIn バリデーション
        if (requestBody.expiresIn) {
            const expiresIn = parseInt(requestBody.expiresIn, 10);
            if (isNaN(expiresIn) || expiresIn < 60 || expiresIn > 3600) {
                errors.push('expiresIn must be between 60 and 3600 seconds');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * ファイルID生成
     */
    private generateFileId(fileName: string): string {
        const timestamp = DateUtils.formatDate(new Date(), 'YYYYMMDD-HHmmss');
        const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '').replace('.csv', '');
        const randomSuffix = StringUtils.randomString(8, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
        return `${timestamp}-${cleanFileName}-${randomSuffix}`;
    }

    /**
     * S3キー生成
     */
    private generateS3Key(fileName: string, fileId: string): string {
        const datePrefix = DateUtils.formatDate(new Date(), 'YYYY/MM/DD');
        const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '');
        return `incoming/${datePrefix}/${fileId}/${cleanFileName}`;
    }

    /**
     * 署名付きアップロードURL生成
     */
    private async generatePresignedUploadUrl(
        bucketName: string,
        s3Key: string,
        contentType: string,
        expiresIn: number,
        metadata: Record<string, any>
    ): Promise<string> {
        // 実際の署名付きURL生成はS3Clientで実装されていると仮定
        // ここでは簡易実装として疑似URLを返す
        const encodedKey = encodeURIComponent(s3Key);
        const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
        return `https://${bucketName}.s3.amazonaws.com/${encodedKey}?X-Amz-Expires=${expiresIn}&X-Amz-SignedHeaders=content-type&x-amz-expires=${expiresAt}`;
    }

    /**
     * 署名付きダウンロードURL生成
     */
    private async generatePresignedDownloadUrl(
        bucketName: string,
        s3Key: string,
        expiresIn: number
    ): Promise<string> {
        const encodedKey = encodeURIComponent(s3Key);
        const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
        return `https://${bucketName}.s3.amazonaws.com/${encodedKey}?X-Amz-Expires=${expiresIn}&x-amz-expires=${expiresAt}`;
    }

    /**
     * ファイル追跡レコード作成
     */
    private async createFileTrackingRecord(record: {
        fileId: string;
        fileName: string;
        s3Bucket: string;
        s3Key: string;
        status: string;
        uploadUrl: string;
        expiresAt: Date;
        metadata: Record<string, any>;
    }): Promise<void> {
        const fileRecord = {
            fileId: record.fileId,
            fileName: record.fileName,
            s3Bucket: record.s3Bucket,
            s3Key: record.s3Key,
            status: record.status,
            uploadUrl: record.uploadUrl,
            createdAt: new Date().toISOString(),
            expiresAt: record.expiresAt.toISOString(),
            metadata: record.metadata
        };

        await this.dynamoClient.putItem(this.fileTrackingTableName, fileRecord);
    }

    /**
     * 処理進捗取得
     */
    private async getProcessingProgress(fileId: string): Promise<{
        progress: {
            totalRecords: number;
            processedRecords: number;
            errorRecords: number;
            progressPercentage: number;
        };
        result?: {
            outputFiles: Array<{
                type: string;
                s3Key: string;
                downloadUrl: string;
            }>;
        };
    }> {
        try {
            // processing_metadata テーブルから進捗情報取得
            const progressRecord = await this.dynamoClient.getItem(
                'processing_metadata',
                { executionId: fileId }
            );

            if (!progressRecord) {
                return {
                    progress: {
                        totalRecords: 0,
                        processedRecords: 0,
                        errorRecords: 0,
                        progressPercentage: 0
                    }
                };
            }

            const progress = {
                totalRecords: progressRecord.totalRecords || 0,
                processedRecords: progressRecord.processedRecords || 0,
                errorRecords: progressRecord.errorRecords || 0,
                progressPercentage: progressRecord.progressPercentage || 0
            };

            let result;
            if (progressRecord.status === 'completed') {
                result = {
                    outputFiles: [
                        {
                            type: 'result',
                            s3Key: this.buildOutputS3Key(fileId, 'result'),
                            downloadUrl: await this.generatePresignedDownloadUrl(
                                this.outputBucketName,
                                this.buildOutputS3Key(fileId, 'result'),
                                3600
                            )
                        },
                        {
                            type: 'summary',
                            s3Key: this.buildOutputS3Key(fileId, 'summary'),
                            downloadUrl: await this.generatePresignedDownloadUrl(
                                this.outputBucketName,
                                this.buildOutputS3Key(fileId, 'summary'),
                                3600
                            )
                        }
                    ]
                };
            }

            return { progress, result };

        } catch (error) {
            logger.warn('Failed to get processing progress', { fileId, error });
            return {
                progress: {
                    totalRecords: 0,
                    processedRecords: 0,
                    errorRecords: 0,
                    progressPercentage: 0
                }
            };
        }
    }

    /**
     * 処理結果取得
     */
    private async getProcessingResult(fileId: string, format: string): Promise<{
        summary: any;
        details: any[];
        statistics: any;
    } | null> {
        try {
            const resultS3Key = this.buildOutputS3Key(fileId, 'result');
            const resultContent = await this.s3Client.getObject(this.outputBucketName, resultS3Key);
            
            if (format === 'json') {
                return JSON.parse(resultContent);
            } else {
                // CSV形式の場合は簡易変換
                const jsonResult = JSON.parse(resultContent);
                return {
                    summary: jsonResult.summary,
                    details: jsonResult.details,
                    statistics: jsonResult.statistics
                };
            }
        } catch (error) {
            logger.warn('Failed to get processing result', { fileId, format, error });
            return null;
        }
    }

    /**
     * 出力ファイルのS3キー構築
     */
    private buildOutputS3Key(fileId: string, fileType: string): string {
        const datePrefix = DateUtils.formatDate(new Date(), 'YYYY/MM/DD');
        return `results/${datePrefix}/${fileId}/${fileType}.json`;
    }

    /**
     * 安全なJSON解析
     */
    private safeParseJson(jsonString: string): any {
        try {
            return JSON.parse(jsonString);
        } catch {
            return {};
        }
    }

    /**
     * 監査ログ記録
     */
    private async recordAuditLog(logEntry: {
        executionId: string;
        timestamp: Date;
        eventType: string;
        logLevel: string;
        functionName: string;
        message: string;
        metadata: Record<string, any>;
    }): Promise<void> {
        try {
            const auditLog = new AuditLog(logEntry);
            await this.auditRepository.saveAuditLog(auditLog);
        } catch (error) {
            logger.warn('Failed to record audit log', { error: error instanceof Error ? error.message : String(error) });
        }
    }

    /**
     * 成功レスポンス作成
     */
    private createSuccessResponse(statusCode: number, body: any, requestId: string): APIGatewayProxyResult {
        return {
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'X-Request-Id': requestId
            },
            body: JSON.stringify(body)
        };
    }

    /**
     * エラーレスポンス作成
     */
    private createErrorResponse(
        statusCode: number, 
        code: string, 
        message: string, 
        additionalInfo: Record<string, any> = {}
    ): APIGatewayProxyResult {
        const errorBody = {
            error: {
                code,
                message,
                timestamp: new Date().toISOString(),
                ...additionalInfo
            }
        };

        return {
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'X-Request-Id': additionalInfo.requestId || 'unknown'
            },
            body: JSON.stringify(errorBody)
        };
    }
}