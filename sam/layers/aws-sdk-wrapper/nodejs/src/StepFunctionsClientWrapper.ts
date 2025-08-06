/**
 * Step Functions Client Wrapper（Lambda Layer）
 * Step Functions操作の共通化・エラーハンドリング・リトライ機能付き
 */
import {
    SFNClient,
    StartExecutionCommand,
    DescribeExecutionCommand,
    StopExecutionCommand,
    ListExecutionsCommand,
    GetExecutionHistoryCommand,
    DescribeStateMachineCommand,
    ListStateMachinesCommand,
    SendTaskSuccessCommand,
    SendTaskFailureCommand,
    SendTaskHeartbeatCommand
} from '@aws-sdk/client-sfn';

export class StepFunctionsClientWrapper {
    private readonly sfnClient: SFNClient;

    constructor(region: string = process.env.AWS_REGION || 'us-east-1') {
        this.sfnClient = new SFNClient({
            region,
            maxAttempts: 3, // 自動リトライ回数
        });
    }

    /**
     * Step Functions実行の開始
     * @param stateMachineArn ステートマシンARN
     * @param input 実行入力（JSON文字列またはオブジェクト）
     * @param executionName 実行名（オプション）
     * @returns 実行開始結果
     */
    async startExecution(
        stateMachineArn: string,
        input: string | Record<string, any>,
        executionName?: string
    ): Promise<{
        executionArn: string;
        startDate: Date;
    }> {
        try {
            const inputString = typeof input === 'string' ? input : JSON.stringify(input);
            
            const command = new StartExecutionCommand({
                stateMachineArn,
                input: inputString,
                name: executionName || this.generateExecutionName()
            });

            const response = await this.sfnClient.send(command);
            return {
                executionArn: response.executionArn!,
                startDate: response.startDate!
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to start execution: ${errorMessage}`);
        }
    }

    /**
     * Step Functions実行の状態取得
     * @param executionArn 実行ARN
     * @returns 実行状態情報
     */
    async getExecutionStatus(executionArn: string): Promise<{
        status: string;
        startDate: Date;
        stopDate?: Date;
        input: string;
        output?: string;
        error?: string;
        cause?: string;
    }> {
        try {
            const command = new DescribeExecutionCommand({
                executionArn
            });

            const response = await this.sfnClient.send(command);
            return {
                status: response.status!,
                startDate: response.startDate!,
                stopDate: response.stopDate,
                input: response.input!,
                output: response.output,
                error: response.error,
                cause: response.cause
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get execution status: ${errorMessage}`);
        }
    }

    /**
     * Step Functions実行の停止
     * @param executionArn 実行ARN
     * @param error エラーメッセージ（オプション）
     * @param cause エラー原因（オプション）
     * @returns 停止結果
     */
    async stopExecution(
        executionArn: string,
        error?: string,
        cause?: string
    ): Promise<{ stopDate: Date }> {
        try {
            const command = new StopExecutionCommand({
                executionArn,
                error,
                cause
            });

            const response = await this.sfnClient.send(command);
            return {
                stopDate: response.stopDate!
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to stop execution: ${errorMessage}`);
        }
    }

    /**
     * 実行履歴の取得
     * @param executionArn 実行ARN
     * @param maxResults 最大取得件数（オプション）
     * @param reverseOrder 逆順で取得するか（オプション）
     * @returns 実行履歴
     */
    async getExecutionHistory(
        executionArn: string,
        maxResults?: number,
        reverseOrder: boolean = false
    ): Promise<{
        events: Array<{
            timestamp: Date;
            type: string;
            id: number;
            previousEventId?: number;
            stateEnteredEventDetails?: any;
            stateExitedEventDetails?: any;
            taskScheduledEventDetails?: any;
            taskSubmittedEventDetails?: any;
            taskSucceededEventDetails?: any;
            taskFailedEventDetails?: any;
            executionFailedEventDetails?: any;
            executionSucceededEventDetails?: any;
        }>;
        nextToken?: string;
    }> {
        try {
            const command = new GetExecutionHistoryCommand({
                executionArn,
                maxResults,
                reverseOrder
            });

            const response = await this.sfnClient.send(command);
            const events = (response.events || []).map(event => ({
                timestamp: event.timestamp!,
                type: event.type!,
                id: event.id!,
                previousEventId: event.previousEventId,
                stateEnteredEventDetails: event.stateEnteredEventDetails,
                stateExitedEventDetails: event.stateExitedEventDetails,
                taskScheduledEventDetails: event.taskScheduledEventDetails,
                taskSubmittedEventDetails: event.taskSubmittedEventDetails,
                taskSucceededEventDetails: event.taskSucceededEventDetails,
                taskFailedEventDetails: event.taskFailedEventDetails,
                executionFailedEventDetails: event.executionFailedEventDetails,
                executionSucceededEventDetails: event.executionSucceededEventDetails
            }));

            return {
                events,
                nextToken: response.nextToken
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get execution history: ${errorMessage}`);
        }
    }

    /**
     * 実行一覧の取得
     * @param stateMachineArn ステートマシンARN
     * @param statusFilter 状態フィルタ（オプション）
     * @param maxResults 最大取得件数（オプション）
     * @returns 実行一覧
     */
    async listExecutions(
        stateMachineArn: string,
        statusFilter?: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED',
        maxResults?: number
    ): Promise<{
        executions: Array<{
            executionArn: string;
            name: string;
            status: string;
            startDate: Date;
            stopDate?: Date;
        }>;
        nextToken?: string;
    }> {
        try {
            const command = new ListExecutionsCommand({
                stateMachineArn,
                statusFilter,
                maxResults
            });

            const response = await this.sfnClient.send(command);
            const executions = (response.executions || []).map(exec => ({
                executionArn: exec.executionArn!,
                name: exec.name!,
                status: exec.status!,
                startDate: exec.startDate!,
                stopDate: exec.stopDate
            }));

            return {
                executions,
                nextToken: response.nextToken
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to list executions: ${errorMessage}`);
        }
    }

    /**
     * ステートマシン情報の取得
     * @param stateMachineArn ステートマシンARN
     * @returns ステートマシン情報
     */
    async getStateMachine(stateMachineArn: string): Promise<{
        name: string;
        stateMachineArn: string;
        definition: string;
        roleArn: string;
        type: string;
        creationDate: Date;
        status: string;
    }> {
        try {
            const command = new DescribeStateMachineCommand({
                stateMachineArn
            });

            const response = await this.sfnClient.send(command);
            return {
                name: response.name!,
                stateMachineArn: response.stateMachineArn!,
                definition: response.definition!,
                roleArn: response.roleArn!,
                type: response.type!,
                creationDate: response.creationDate!,
                status: response.status!
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get state machine: ${errorMessage}`);
        }
    }

    /**
     * タスク成功の通知
     * @param taskToken タスクトークン
     * @param output 出力データ（JSON文字列またはオブジェクト）
     * @returns 通知結果
     */
    async sendTaskSuccess(
        taskToken: string,
        output: string | Record<string, any>
    ): Promise<{ success: boolean }> {
        try {
            const outputString = typeof output === 'string' ? output : JSON.stringify(output);
            
            const command = new SendTaskSuccessCommand({
                taskToken,
                output: outputString
            });

            await this.sfnClient.send(command);
            return { success: true };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to send task success: ${errorMessage}`);
        }
    }

    /**
     * タスク失敗の通知
     * @param taskToken タスクトークン
     * @param error エラーメッセージ
     * @param cause エラー原因（オプション）
     * @returns 通知結果
     */
    async sendTaskFailure(
        taskToken: string,
        error: string,
        cause?: string
    ): Promise<{ success: boolean }> {
        try {
            const command = new SendTaskFailureCommand({
                taskToken,
                error,
                cause
            });

            await this.sfnClient.send(command);
            return { success: true };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to send task failure: ${errorMessage}`);
        }
    }

    /**
     * タスクハートビートの送信
     * @param taskToken タスクトークン
     * @returns ハートビート送信結果
     */
    async sendTaskHeartbeat(taskToken: string): Promise<{ success: boolean }> {
        try {
            const command = new SendTaskHeartbeatCommand({
                taskToken
            });

            await this.sfnClient.send(command);
            return { success: true };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to send task heartbeat: ${errorMessage}`);
        }
    }

    /**
     * 実行の完了待機（ポーリング）
     * @param executionArn 実行ARN
     * @param pollIntervalMs ポーリング間隔（ms）
     * @param timeoutMs タイムアウト時間（ms）
     * @returns 最終実行状態
     */
    async waitForExecution(
        executionArn: string,
        pollIntervalMs: number = 5000,
        timeoutMs: number = 300000 // 5分
    ): Promise<{
        status: string;
        output?: string;
        error?: string;
        cause?: string;
        elapsedTimeMs: number;
    }> {
        const startTime = Date.now();
        const endTime = startTime + timeoutMs;

        while (Date.now() < endTime) {
            const status = await this.getExecutionStatus(executionArn);
            
            // 終了状態のチェック
            if (['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED'].includes(status.status)) {
                return {
                    status: status.status,
                    output: status.output,
                    error: status.error,
                    cause: status.cause,
                    elapsedTimeMs: Date.now() - startTime
                };
            }

            // ポーリング間隔待機
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }

        throw new Error(`Execution wait timeout after ${timeoutMs}ms: ${executionArn}`);
    }

    /**
     * バッチ実行の開始（複数の実行を同時開始）
     * @param executions 実行情報の配列
     * @returns バッチ実行結果
     */
    async startBatchExecutions(
        executions: Array<{
            stateMachineArn: string;
            input: string | Record<string, any>;
            executionName?: string;
        }>
    ): Promise<{
        successful: Array<{ executionArn: string; startDate: Date }>;
        failed: Array<{ error: string; input: any }>;
    }> {
        const successful: Array<{ executionArn: string; startDate: Date }> = [];
        const failed: Array<{ error: string; input: any }> = [];

        // 並列実行開始（同時に10個まで）
        const BATCH_SIZE = 10;
        for (let i = 0; i < executions.length; i += BATCH_SIZE) {
            const batch = executions.slice(i, i + BATCH_SIZE);
            
            const promises = batch.map(async (exec) => {
                try {
                    const result = await this.startExecution(
                        exec.stateMachineArn,
                        exec.input,
                        exec.executionName
                    );
                    successful.push(result);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    failed.push({ error: errorMessage, input: exec.input });
                }
            });

            await Promise.all(promises);
        }

        return { successful, failed };
    }

    /**
     * 実行名の生成
     * @returns ユニークな実行名
     */
    private generateExecutionName(): string {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const random = Math.random().toString(36).substring(2, 8);
        return `execution-${timestamp}-${random}`;
    }

    /**
     * Step Functions クライアントの終了
     */
    destroy(): void {
        this.sfnClient.destroy();
    }
}