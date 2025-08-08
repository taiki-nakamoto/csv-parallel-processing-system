import { Logger } from '@aws-lambda-powertools/logger';
import { APIGatewayProxyEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import { StepFunctionsClientWrapper } from '/opt/nodejs/src/StepFunctionsClientWrapper';
import { ValidationUtils } from '/opt/nodejs/src/ValidationUtils';
import { DateUtils } from '/opt/nodejs/src/DateUtils';
import { DynamoDbAuditRepository } from '@infrastructure/repositories/DynamoDbAuditRepository';
import { AuditLog } from '@domain/models/AuditLog';

const logger = new Logger({ serviceName: 'step-functions-controller' });

/**
 * Step Functions管理APIコントローラー
 * 設計書: 03-13_詳細設計書_API詳細設計.md Section 4
 */
export class StepFunctionsController {
    private readonly stepFunctionsClient: StepFunctionsClientWrapper;
    private readonly auditRepository: DynamoDbAuditRepository;
    private readonly stateMachineArn: string;

    constructor(
        stepFunctionsClient: StepFunctionsClientWrapper,
        auditRepository: DynamoDbAuditRepository
    ) {
        this.stepFunctionsClient = stepFunctionsClient;
        this.auditRepository = auditRepository;
        this.stateMachineArn = process.env.STATE_MACHINE_ARN || '';

        if (!this.stateMachineArn) {
            throw new Error('STATE_MACHINE_ARN environment variable is required');
        }
    }

    /**
     * Step Functions実行一覧取得 API
     * GET /executions
     */
    async getExecutions(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
        const requestId = context.awsRequestId;
        const startTime = Date.now();

        try {
            logger.info('Getting Step Functions executions', { requestId });

            // クエリパラメータ取得・バリデーション
            const queryParams = event.queryStringParameters || {};
            const validationResult = this.validateGetExecutionsParams(queryParams);
            
            if (!validationResult.isValid) {
                return this.createErrorResponse(400, 'VALIDATION_ERROR', 'Invalid query parameters', {
                    details: validationResult.errors,
                    requestId
                });
            }

            const {
                status,
                limit = 20,
                nextToken,
                startTimeFilter,
                endTimeFilter
            } = validationResult.params!;

            // Step Functions実行一覧取得
            const executionsResult = await this.stepFunctionsClient.listExecutions(
                this.stateMachineArn,
                status,
                limit
            );

            // 時刻フィルタリング（必要に応じて）
            let filteredExecutions = executionsResult.executions;
            if (startTimeFilter || endTimeFilter) {
                filteredExecutions = this.filterExecutionsByTime(
                    executionsResult.executions,
                    startTimeFilter,
                    endTimeFilter
                );
            }

            // レスポンス変換
            const responseBody = {
                executions: filteredExecutions.map(execution => ({
                    executionArn: execution.executionArn,
                    name: execution.name,
                    status: execution.status,
                    startDate: execution.startDate.toISOString(),
                    stopDate: execution.stopDate?.toISOString(),
                    input: this.safeParseJson(execution.input || '{}')
                })),
                nextToken: executionsResult.nextToken,
                totalCount: filteredExecutions.length
            };

            // 監査ログ記録
            await this.recordAuditLog({
                executionId: requestId,
                timestamp: new Date(),
                eventType: 'API_EXECUTION_LIST',
                logLevel: 'INFO',
                functionName: 'StepFunctionsController.getExecutions',
                message: 'Step Functions execution list retrieved successfully',
                metadata: {
                    requestId,
                    resultCount: filteredExecutions.length,
                    processingTime: Date.now() - startTime
                }
            });

            return this.createSuccessResponse(200, responseBody, requestId);

        } catch (error) {
            logger.error('Failed to get Step Functions executions', { 
                error: error instanceof Error ? error.message : String(error),
                requestId 
            });

            await this.recordAuditLog({
                executionId: requestId,
                timestamp: new Date(),
                eventType: 'API_EXECUTION_LIST_ERROR',
                logLevel: 'ERROR',
                functionName: 'StepFunctionsController.getExecutions',
                message: 'Failed to retrieve Step Functions execution list',
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
     * Step Functions実行開始 API
     * POST /executions
     */
    async startExecution(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
        const requestId = context.awsRequestId;
        const startTime = Date.now();

        try {
            logger.info('Starting Step Functions execution', { requestId });

            // リクエストボディのバリデーション
            const requestBody = this.safeParseJson(event.body || '{}');
            const validationResult = this.validateStartExecutionRequest(requestBody);

            if (!validationResult.isValid) {
                return this.createErrorResponse(400, 'VALIDATION_ERROR', 'Invalid request body', {
                    details: validationResult.errors,
                    requestId
                });
            }

            const {
                s3Bucket,
                s3Key,
                executionName,
                priority = 'NORMAL',
                metadata = {}
            } = requestBody;

            // 実行名生成（省略時は自動生成）
            const finalExecutionName = executionName || this.generateExecutionName(s3Key);

            // Step Functions実行入力準備
            const executionInput = {
                bucketName: s3Bucket,
                objectKey: s3Key,
                priority,
                metadata: {
                    ...metadata,
                    requestId,
                    startedBy: 'API',
                    apiVersion: 'v1'
                }
            };

            // Step Functions実行開始
            const executionResult = await this.stepFunctionsClient.startExecution(
                this.stateMachineArn,
                executionInput,
                finalExecutionName
            );

            // レスポンス作成
            const responseBody = {
                executionArn: executionResult.executionArn,
                executionName: finalExecutionName,
                startDate: executionResult.startDate.toISOString(),
                status: 'RUNNING'
            };

            // 監査ログ記録
            await this.recordAuditLog({
                executionId: finalExecutionName,
                timestamp: new Date(),
                eventType: 'API_EXECUTION_START',
                logLevel: 'INFO',
                functionName: 'StepFunctionsController.startExecution',
                message: 'Step Functions execution started successfully',
                metadata: {
                    requestId,
                    executionArn: executionResult.executionArn,
                    s3Bucket,
                    s3Key,
                    priority,
                    processingTime: Date.now() - startTime
                }
            });

            return this.createSuccessResponse(201, responseBody, requestId);

        } catch (error) {
            logger.error('Failed to start Step Functions execution', { 
                error: error instanceof Error ? error.message : String(error),
                requestId 
            });

            // 実行名重複エラーの特別処理
            if (error instanceof Error && error.message.includes('ExecutionAlreadyExists')) {
                return this.createErrorResponse(409, 'EXECUTION_ALREADY_EXISTS', 'Execution name already exists', {
                    requestId,
                    suggestion: 'Use a different execution name or omit it for auto-generation'
                });
            }

            await this.recordAuditLog({
                executionId: requestId,
                timestamp: new Date(),
                eventType: 'API_EXECUTION_START_ERROR',
                logLevel: 'ERROR',
                functionName: 'StepFunctionsController.startExecution',
                message: 'Failed to start Step Functions execution',
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
     * Step Functions実行状態取得 API
     * GET /executions/{executionId}/status
     */
    async getExecutionStatus(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
        const requestId = context.awsRequestId;
        const startTime = Date.now();

        try {
            const executionId = event.pathParameters?.executionId;
            if (!executionId) {
                return this.createErrorResponse(400, 'INVALID_REQUEST', 'Execution ID is required', { requestId });
            }

            logger.info('Getting Step Functions execution status', { requestId, executionId });

            // 実行ARN構築（IDのみの場合）
            const executionArn = executionId.startsWith('arn:') 
                ? executionId 
                : this.buildExecutionArn(executionId);

            // Step Functions実行状態取得
            const executionStatus = await this.stepFunctionsClient.getExecutionStatus(executionArn);

            // 実行履歴取得（最新10件）
            const executionHistory = await this.stepFunctionsClient.getExecutionHistory(executionArn, 10, true);

            // レスポンス作成
            const responseBody = {
                executionArn: executionStatus.status === 'RUNNING' ? executionArn : executionArn,
                name: this.extractExecutionNameFromArn(executionArn),
                status: executionStatus.status,
                startDate: executionStatus.startDate.toISOString(),
                stopDate: executionStatus.stopDate?.toISOString(),
                input: this.safeParseJson(executionStatus.input || '{}'),
                output: executionStatus.output ? this.safeParseJson(executionStatus.output) : undefined,
                error: executionStatus.error,
                cause: executionStatus.cause,
                executionHistory: executionHistory.events.slice(0, 10).map(event => ({
                    timestamp: event.timestamp.toISOString(),
                    type: event.type,
                    id: event.id,
                    previousEventId: event.previousEventId
                }))
            };

            // 監査ログ記録
            await this.recordAuditLog({
                executionId,
                timestamp: new Date(),
                eventType: 'API_EXECUTION_STATUS',
                logLevel: 'INFO',
                functionName: 'StepFunctionsController.getExecutionStatus',
                message: 'Step Functions execution status retrieved successfully',
                metadata: {
                    requestId,
                    executionArn,
                    status: executionStatus.status,
                    processingTime: Date.now() - startTime
                }
            });

            return this.createSuccessResponse(200, responseBody, requestId);

        } catch (error) {
            logger.error('Failed to get Step Functions execution status', { 
                error: error instanceof Error ? error.message : String(error),
                requestId 
            });

            // 実行が見つからないエラーの特別処理
            if (error instanceof Error && error.message.includes('ExecutionDoesNotExist')) {
                return this.createErrorResponse(404, 'EXECUTION_NOT_FOUND', 'Execution not found', { requestId });
            }

            return this.createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', { requestId });
        }
    }

    /**
     * Step Functions実行停止 API
     * POST /executions/{executionId}/stop
     */
    async stopExecution(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
        const requestId = context.awsRequestId;
        const startTime = Date.now();

        try {
            const executionId = event.pathParameters?.executionId;
            if (!executionId) {
                return this.createErrorResponse(400, 'INVALID_REQUEST', 'Execution ID is required', { requestId });
            }

            logger.info('Stopping Step Functions execution', { requestId, executionId });

            // リクエストボディ取得
            const requestBody = this.safeParseJson(event.body || '{}');
            const cause = requestBody.cause || 'Stopped via Management API';
            const error = requestBody.error || 'USER_REQUESTED_STOP';

            // 実行ARN構築
            const executionArn = executionId.startsWith('arn:') 
                ? executionId 
                : this.buildExecutionArn(executionId);

            // Step Functions実行停止
            const stopResult = await this.stepFunctionsClient.stopExecution(executionArn, error, cause);

            // レスポンス作成
            const responseBody = {
                stopDate: stopResult.stopDate.toISOString(),
                status: 'ABORTED'
            };

            // 監査ログ記録
            await this.recordAuditLog({
                executionId,
                timestamp: new Date(),
                eventType: 'API_EXECUTION_STOP',
                logLevel: 'INFO',
                functionName: 'StepFunctionsController.stopExecution',
                message: 'Step Functions execution stopped successfully',
                metadata: {
                    requestId,
                    executionArn,
                    cause,
                    error,
                    processingTime: Date.now() - startTime
                }
            });

            return this.createSuccessResponse(200, responseBody, requestId);

        } catch (error) {
            logger.error('Failed to stop Step Functions execution', { 
                error: error instanceof Error ? error.message : String(error),
                requestId 
            });

            // 実行が見つからないエラーの特別処理
            if (error instanceof Error && error.message.includes('ExecutionDoesNotExist')) {
                return this.createErrorResponse(404, 'EXECUTION_NOT_FOUND', 'Execution not found', { requestId });
            }

            // 停止不可能な状態エラーの特別処理
            if (error instanceof Error && error.message.includes('InvalidParameterValue')) {
                return this.createErrorResponse(409, 'PROCESSING_IN_PROGRESS', 'Execution cannot be stopped in current state', { requestId });
            }

            return this.createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', { requestId });
        }
    }

    // プライベートメソッド

    /**
     * GetExecutionsパラメータバリデーション
     */
    private validateGetExecutionsParams(params: Record<string, string>): {
        isValid: boolean;
        errors: string[];
        params?: {
            status?: string;
            limit: number;
            nextToken?: string;
            startTimeFilter?: Date;
            endTimeFilter?: Date;
        };
    } {
        const errors: string[] = [];
        const validatedParams: any = {};

        // status バリデーション
        if (params.status) {
            const validStatuses = ['RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED'];
            if (!validStatuses.includes(params.status)) {
                errors.push(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
            } else {
                validatedParams.status = params.status;
            }
        }

        // limit バリデーション
        if (params.limit) {
            const limit = parseInt(params.limit, 10);
            if (isNaN(limit) || limit < 1 || limit > 100) {
                errors.push('Limit must be between 1 and 100');
            } else {
                validatedParams.limit = limit;
            }
        } else {
            validatedParams.limit = 20;
        }

        // nextToken バリデーション（そのまま通す）
        if (params.nextToken) {
            validatedParams.nextToken = params.nextToken;
        }

        // startTime バリデーション
        if (params.startTime) {
            const startTimeResult = ValidationUtils.validateDate(params.startTime, 'startTime');
            if (!startTimeResult.isValid) {
                errors.push(...startTimeResult.errors);
            } else {
                validatedParams.startTimeFilter = startTimeResult.parsedValue;
            }
        }

        // endTime バリデーション
        if (params.endTime) {
            const endTimeResult = ValidationUtils.validateDate(params.endTime, 'endTime');
            if (!endTimeResult.isValid) {
                errors.push(...endTimeResult.errors);
            } else {
                validatedParams.endTimeFilter = endTimeResult.parsedValue;
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            params: errors.length === 0 ? validatedParams : undefined
        };
    }

    /**
     * StartExecutionリクエストバリデーション
     */
    private validateStartExecutionRequest(requestBody: any): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        // 必須フィールドチェック
        if (!requestBody.s3Bucket || typeof requestBody.s3Bucket !== 'string') {
            errors.push('s3Bucket is required and must be a string');
        }

        if (!requestBody.s3Key || typeof requestBody.s3Key !== 'string') {
            errors.push('s3Key is required and must be a string');
        }

        // 任意フィールドチェック
        if (requestBody.executionName && typeof requestBody.executionName !== 'string') {
            errors.push('executionName must be a string');
        }

        if (requestBody.executionName && requestBody.executionName.length > 80) {
            errors.push('executionName must not exceed 80 characters');
        }

        if (requestBody.executionName && !/^[a-zA-Z0-9_-]+$/.test(requestBody.executionName)) {
            errors.push('executionName must contain only alphanumeric characters, underscores, and hyphens');
        }

        if (requestBody.priority && !['HIGH', 'NORMAL', 'LOW'].includes(requestBody.priority)) {
            errors.push('priority must be one of: HIGH, NORMAL, LOW');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * 時刻による実行フィルタリング
     */
    private filterExecutionsByTime(
        executions: Array<{ startDate: Date; stopDate?: Date }>,
        startTimeFilter?: Date,
        endTimeFilter?: Date
    ): Array<{ startDate: Date; stopDate?: Date }> {
        return executions.filter(execution => {
            if (startTimeFilter && execution.startDate < startTimeFilter) {
                return false;
            }
            if (endTimeFilter && execution.startDate > endTimeFilter) {
                return false;
            }
            return true;
        });
    }

    /**
     * 実行名生成（S3キーベース）
     */
    private generateExecutionName(s3Key: string): string {
        const timestamp = DateUtils.formatDate(new Date(), 'YYYYMMDD-HHmmss');
        const filename = s3Key.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'file';
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        return `api-${timestamp}-${filename}-${randomSuffix}`;
    }

    /**
     * 実行ARN構築
     */
    private buildExecutionArn(executionName: string): string {
        const stateMachineArnParts = this.stateMachineArn.split(':');
        return `${stateMachineArnParts.slice(0, 5).join(':')}:execution:${stateMachineArnParts[6]}:${executionName}`;
    }

    /**
     * ARNから実行名抽出
     */
    private extractExecutionNameFromArn(executionArn: string): string {
        return executionArn.split(':').pop() || '';
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