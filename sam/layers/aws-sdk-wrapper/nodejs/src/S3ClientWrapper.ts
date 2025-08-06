/**
 * S3Client Wrapper（Lambda Layer）
 * S3操作の共通化・エラーハンドリング・リトライ機能付き
 */
import { S3Client, GetObjectCommand, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export class S3ClientWrapper {
    private readonly s3Client: S3Client;

    constructor(region: string = process.env.AWS_REGION || 'us-east-1') {
        this.s3Client = new S3Client({
            region,
            maxAttempts: 3, // 自動リトライ回数
        });
    }

    /**
     * オブジェクトの取得
     * @param bucketName バケット名
     * @param key オブジェクトキー
     * @returns オブジェクトのボディ（string）
     */
    async getObject(bucketName: string, key: string): Promise<string> {
        try {
            const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: key
            });

            const response = await this.s3Client.send(command);

            if (!response.Body) {
                throw new Error(`Object body is empty: ${bucketName}/${key}`);
            }

            // Streamを文字列に変換
            if (response.Body instanceof Readable) {
                const chunks: Buffer[] = [];
                for await (const chunk of response.Body) {
                    chunks.push(chunk);
                }
                return Buffer.concat(chunks).toString('utf-8');
            }

            // その他のBody形式への対応
            if (response.Body instanceof Uint8Array) {
                return Buffer.from(response.Body).toString('utf-8');
            }

            return response.Body.toString();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get object ${bucketName}/${key}: ${errorMessage}`);
        }
    }

    /**
     * オブジェクトの保存
     * @param bucketName バケット名
     * @param key オブジェクトキー
     * @param content コンテンツ
     * @param contentType Content-Type（デフォルト: application/octet-stream）
     * @returns PutObjectの結果
     */
    async putObject(
        bucketName: string, 
        key: string, 
        content: string | Buffer | Uint8Array,
        contentType: string = 'application/octet-stream'
    ): Promise<{ ETag?: string; VersionId?: string }> {
        try {
            const command = new PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                Body: content,
                ContentType: contentType
            });

            const response = await this.s3Client.send(command);
            return {
                ETag: response.ETag,
                VersionId: response.VersionId
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to put object ${bucketName}/${key}: ${errorMessage}`);
        }
    }

    /**
     * オブジェクトのコピー
     * @param sourceBucket ソースバケット
     * @param sourceKey ソースキー
     * @param targetBucket ターゲットバケット
     * @param targetKey ターゲットキー
     * @returns CopyObjectの結果
     */
    async copyObject(
        sourceBucket: string,
        sourceKey: string,
        targetBucket: string,
        targetKey: string
    ): Promise<{ ETag?: string; LastModified?: Date }> {
        try {
            const command = new CopyObjectCommand({
                CopySource: `${sourceBucket}/${sourceKey}`,
                Bucket: targetBucket,
                Key: targetKey
            });

            const response = await this.s3Client.send(command);
            return {
                ETag: response.CopyResult?.ETag,
                LastModified: response.CopyResult?.LastModified
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to copy object ${sourceBucket}/${sourceKey} to ${targetBucket}/${targetKey}: ${errorMessage}`);
        }
    }

    /**
     * オブジェクトの削除
     * @param bucketName バケット名
     * @param key オブジェクトキー
     * @returns DeleteObjectの結果
     */
    async deleteObject(bucketName: string, key: string): Promise<{ DeleteMarker?: boolean; VersionId?: string }> {
        try {
            const command = new DeleteObjectCommand({
                Bucket: bucketName,
                Key: key
            });

            const response = await this.s3Client.send(command);
            return {
                DeleteMarker: response.DeleteMarker,
                VersionId: response.VersionId
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete object ${bucketName}/${key}: ${errorMessage}`);
        }
    }

    /**
     * オブジェクトのメタデータ取得
     * @param bucketName バケット名
     * @param key オブジェクトキー
     * @returns オブジェクトメタデータ
     */
    async headObject(bucketName: string, key: string): Promise<{
        ContentLength?: number;
        ContentType?: string;
        LastModified?: Date;
        ETag?: string;
        Metadata?: Record<string, string>;
    }> {
        try {
            const command = new HeadObjectCommand({
                Bucket: bucketName,
                Key: key
            });

            const response = await this.s3Client.send(command);
            return {
                ContentLength: response.ContentLength,
                ContentType: response.ContentType,
                LastModified: response.LastModified,
                ETag: response.ETag,
                Metadata: response.Metadata
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get object metadata ${bucketName}/${key}: ${errorMessage}`);
        }
    }

    /**
     * オブジェクトの存在確認
     * @param bucketName バケット名
     * @param key オブジェクトキー
     * @returns 存在する場合true
     */
    async objectExists(bucketName: string, key: string): Promise<boolean> {
        try {
            await this.headObject(bucketName, key);
            return true;
        } catch (error) {
            // NoSuchKeyエラーの場合は存在しない
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('NoSuchKey') || errorMessage.includes('NotFound')) {
                return false;
            }
            // その他のエラーは再スロー
            throw error;
        }
    }

    /**
     * ファイルサイズ取得
     * @param bucketName バケット名
     * @param key オブジェクトキー
     * @returns ファイルサイズ（バイト）
     */
    async getObjectSize(bucketName: string, key: string): Promise<number> {
        const metadata = await this.headObject(bucketName, key);
        return metadata.ContentLength || 0;
    }

    /**
     * gzipファイルのアップロード
     * @param bucketName バケット名
     * @param key オブジェクトキー
     * @param content コンテンツ
     * @returns アップロード結果
     */
    async putGzipObject(
        bucketName: string, 
        key: string, 
        content: string | Buffer
    ): Promise<{ ETag?: string; VersionId?: string }> {
        const zlib = await import('zlib');
        
        const gzipped = zlib.gzipSync(content);
        
        return await this.putObject(bucketName, key, gzipped, 'application/gzip');
    }

    /**
     * gzipファイルのダウンロード・展開
     * @param bucketName バケット名
     * @param key オブジェクトキー
     * @returns 展開済みコンテンツ
     */
    async getGzipObject(bucketName: string, key: string): Promise<string> {
        const zlib = await import('zlib');
        
        const compressed = await this.getObject(bucketName, key);
        const buffer = Buffer.from(compressed, 'binary');
        
        const decompressed = zlib.gunzipSync(buffer);
        return decompressed.toString('utf-8');
    }

    /**
     * リトライ機能付きオブジェクト取得
     * @param bucketName バケット名
     * @param key オブジェクトキー
     * @param maxRetries 最大リトライ回数
     * @param retryDelay リトライ間隔（ms）
     * @returns オブジェクトの内容
     */
    async getObjectWithRetry(
        bucketName: string, 
        key: string,
        maxRetries: number = 3,
        retryDelay: number = 1000
    ): Promise<string> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await this.getObject(bucketName, key);
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                
                if (attempt === maxRetries) {
                    break;
                }

                // 指数バックオフによる遅延
                const delay = retryDelay * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw new Error(`Failed to get object after ${maxRetries + 1} attempts: ${lastError?.message}`);
    }

    /**
     * バッチオブジェクト削除
     * @param bucketName バケット名
     * @param keys 削除するオブジェクトキーの配列
     * @returns 削除結果
     */
    async deleteObjects(bucketName: string, keys: string[]): Promise<{
        successful: string[];
        failed: Array<{ key: string; error: string }>;
    }> {
        const successful: string[] = [];
        const failed: Array<{ key: string; error: string }> = [];

        // 並列削除（同時に10個まで）
        const BATCH_SIZE = 10;
        for (let i = 0; i < keys.length; i += BATCH_SIZE) {
            const batch = keys.slice(i, i + BATCH_SIZE);
            
            const promises = batch.map(async (key) => {
                try {
                    await this.deleteObject(bucketName, key);
                    successful.push(key);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    failed.push({ key, error: errorMessage });
                }
            });

            await Promise.all(promises);
        }

        return { successful, failed };
    }

    /**
     * S3クライアントの終了
     */
    destroy(): void {
        this.s3Client.destroy();
    }
}