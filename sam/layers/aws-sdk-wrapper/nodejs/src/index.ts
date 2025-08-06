/**
 * AWS SDK Wrapper Layer - Entry Point
 * AWS SDK操作の共通化・エラーハンドリング・リトライ機能付きクライアント
 */
export { S3ClientWrapper } from './S3ClientWrapper';
export { DynamoDBClientWrapper } from './DynamoDBClientWrapper';
export { StepFunctionsClientWrapper } from './StepFunctionsClientWrapper';

// 便利な型定義もエクスポート
export interface AWSClientOptions {
    region?: string;
    maxRetries?: number;
    timeout?: number;
}

// AWS SDK Wrapper ファクトリー
export class AWSClientFactory {
    private static s3Client: S3ClientWrapper | null = null;
    private static dynamoClient: DynamoDBClientWrapper | null = null;
    private static stepFunctionsClient: StepFunctionsClientWrapper | null = null;

    /**
     * S3クライアントのシングルトンインスタンス取得
     * @param region AWSリージョン
     * @returns S3ClientWrapperインスタンス
     */
    static getS3Client(region?: string): S3ClientWrapper {
        if (!this.s3Client) {
            this.s3Client = new S3ClientWrapper(region);
        }
        return this.s3Client;
    }

    /**
     * DynamoDBクライアントのシングルトンインスタンス取得
     * @param region AWSリージョン
     * @returns DynamoDBClientWrapperインスタンス
     */
    static getDynamoDBClient(region?: string): DynamoDBClientWrapper {
        if (!this.dynamoClient) {
            this.dynamoClient = new DynamoDBClientWrapper(region);
        }
        return this.dynamoClient;
    }

    /**
     * Step Functionsクライアントのシングルトンインスタンス取得
     * @param region AWSリージョン
     * @returns StepFunctionsClientWrapperインスタンス
     */
    static getStepFunctionsClient(region?: string): StepFunctionsClientWrapper {
        if (!this.stepFunctionsClient) {
            this.stepFunctionsClient = new StepFunctionsClientWrapper(region);
        }
        return this.stepFunctionsClient;
    }

    /**
     * すべてのクライアントインスタンスをクリア
     * Lambda関数終了時などに使用
     */
    static destroyAll(): void {
        if (this.s3Client) {
            this.s3Client.destroy();
            this.s3Client = null;
        }
        if (this.dynamoClient) {
            this.dynamoClient.destroy();
            this.dynamoClient = null;
        }
        if (this.stepFunctionsClient) {
            this.stepFunctionsClient.destroy();
            this.stepFunctionsClient = null;
        }
    }
}