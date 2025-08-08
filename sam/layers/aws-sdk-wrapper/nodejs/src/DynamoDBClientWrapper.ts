/**
 * DynamoDB Client Wrapper（Lambda Layer）
 * DynamoDB操作の共通化・エラーハンドリング・リトライ機能付き
 */
import { 
    DynamoDBClient,
    PutItemCommand,
    GetItemCommand,
    UpdateItemCommand,
    DeleteItemCommand,
    QueryCommand,
    ScanCommand,
    BatchWriteItemCommand,
    BatchGetItemCommand
} from '@aws-sdk/client-dynamodb';
import { 
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand,
    UpdateCommand,
    DeleteCommand,
    QueryCommand as DocQueryCommand,
    ScanCommand as DocScanCommand,
    BatchWriteCommand,
    BatchGetCommand
} from '@aws-sdk/lib-dynamodb';

export class DynamoDBClientWrapper {
    private readonly dynamoClient: DynamoDBClient;
    private readonly docClient: DynamoDBDocumentClient;

    constructor(region: string = process.env.AWS_REGION || 'us-east-1') {
        this.dynamoClient = new DynamoDBClient({
            region,
            maxAttempts: 3, // 自動リトライ回数
        });
        
        this.docClient = DynamoDBDocumentClient.from(this.dynamoClient, {
            marshallOptions: {
                convertEmptyValues: false, // 空文字列をnullに変換しない
                removeUndefinedValues: true, // undefinedプロパティを削除
                convertClassInstanceToMap: true, // クラスインスタンスをMapに変換
            },
            unmarshallOptions: {
                wrapNumbers: false, // 数値をNumberオブジェクトでラップしない
            },
        });
    }

    /**
     * 単一アイテムの挿入・更新
     * @param tableName テーブル名
     * @param item アイテムデータ
     * @param conditionExpression 条件式（オプション）
     * @returns 実行結果
     */
    async putItem(
        tableName: string,
        item: Record<string, any>,
        conditionExpression?: string
    ): Promise<{ success: boolean; consumedCapacity?: number }> {
        try {
            const command = new PutCommand({
                TableName: tableName,
                Item: item,
                ConditionExpression: conditionExpression,
                ReturnConsumedCapacity: 'TOTAL'
            });

            const response = await this.docClient.send(command);
            return {
                success: true,
                consumedCapacity: response.ConsumedCapacity?.CapacityUnits
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to put item in ${tableName}: ${errorMessage}`);
        }
    }

    /**
     * 単一アイテムの取得
     * @param tableName テーブル名
     * @param key パーティションキー・ソートキー
     * @param projectionExpression 取得フィールド指定（オプション）
     * @returns アイテムデータ（存在しない場合はnull）
     */
    async getItem(
        tableName: string,
        key: Record<string, any>,
        projectionExpression?: string
    ): Promise<Record<string, any> | null> {
        try {
            const command = new GetCommand({
                TableName: tableName,
                Key: key,
                ProjectionExpression: projectionExpression,
                ReturnConsumedCapacity: 'TOTAL'
            });

            const response = await this.docClient.send(command);
            return response.Item || null;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get item from ${tableName}: ${errorMessage}`);
        }
    }

    /**
     * アイテムの更新
     * @param tableName テーブル名
     * @param key パーティションキー・ソートキー
     * @param updateExpression 更新式
     * @param expressionAttributeValues 式の値
     * @param conditionExpression 条件式（オプション）
     * @returns 更新結果
     */
    async updateItem(
        tableName: string,
        key: Record<string, any>,
        updateExpression: string,
        expressionAttributeValues?: Record<string, any>,
        conditionExpression?: string
    ): Promise<{ success: boolean; attributes?: Record<string, any> }> {
        try {
            const command = new UpdateCommand({
                TableName: tableName,
                Key: key,
                UpdateExpression: updateExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                ConditionExpression: conditionExpression,
                ReturnValues: 'UPDATED_NEW',
                ReturnConsumedCapacity: 'TOTAL'
            });

            const response = await this.docClient.send(command);
            return {
                success: true,
                attributes: response.Attributes
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to update item in ${tableName}: ${errorMessage}`);
        }
    }

    /**
     * アイテムの削除
     * @param tableName テーブル名
     * @param key パーティションキー・ソートキー
     * @param conditionExpression 条件式（オプション）
     * @returns 削除結果
     */
    async deleteItem(
        tableName: string,
        key: Record<string, any>,
        conditionExpression?: string
    ): Promise<{ success: boolean; deletedAttributes?: Record<string, any> }> {
        try {
            const command = new DeleteCommand({
                TableName: tableName,
                Key: key,
                ConditionExpression: conditionExpression,
                ReturnValues: 'ALL_OLD',
                ReturnConsumedCapacity: 'TOTAL'
            });

            const response = await this.docClient.send(command);
            return {
                success: true,
                deletedAttributes: response.Attributes
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete item from ${tableName}: ${errorMessage}`);
        }
    }

    /**
     * クエリ実行（パーティションキーによる検索）
     * @param tableName テーブル名
     * @param keyConditionExpression キー条件式
     * @param filterExpression フィルタ式（オプション）
     * @param expressionAttributeValues 式の値
     * @param limit 取得上限（オプション）
     * @param indexName インデックス名（オプション）
     * @returns クエリ結果
     */
    async queryItems(
        tableName: string,
        keyConditionExpression: string,
        filterExpression?: string,
        expressionAttributeValues?: Record<string, any>,
        limit?: number,
        indexName?: string
    ): Promise<{
        items: Record<string, any>[];
        count: number;
        scannedCount: number;
        lastEvaluatedKey?: Record<string, any>;
    }> {
        try {
            const command = new DocQueryCommand({
                TableName: tableName,
                KeyConditionExpression: keyConditionExpression,
                FilterExpression: filterExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                Limit: limit,
                IndexName: indexName,
                ReturnConsumedCapacity: 'TOTAL'
            });

            const response = await this.docClient.send(command);
            return {
                items: response.Items || [],
                count: response.Count || 0,
                scannedCount: response.ScannedCount || 0,
                lastEvaluatedKey: response.LastEvaluatedKey
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to query items from ${tableName}: ${errorMessage}`);
        }
    }

    /**
     * スキャン実行（全件検索）
     * @param tableName テーブル名
     * @param filterExpression フィルタ式（オプション）
     * @param expressionAttributeValues 式の値
     * @param limit 取得上限（オプション）
     * @param indexName インデックス名（オプション）
     * @returns スキャン結果
     */
    async scanItems(
        tableName: string,
        filterExpression?: string,
        expressionAttributeValues?: Record<string, any>,
        limit?: number,
        indexName?: string
    ): Promise<{
        items: Record<string, any>[];
        count: number;
        scannedCount: number;
        lastEvaluatedKey?: Record<string, any>;
    }> {
        try {
            const command = new DocScanCommand({
                TableName: tableName,
                FilterExpression: filterExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                Limit: limit,
                IndexName: indexName,
                ReturnConsumedCapacity: 'TOTAL'
            });

            const response = await this.docClient.send(command);
            return {
                items: response.Items || [],
                count: response.Count || 0,
                scannedCount: response.ScannedCount || 0,
                lastEvaluatedKey: response.LastEvaluatedKey
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to scan items from ${tableName}: ${errorMessage}`);
        }
    }

    /**
     * バッチ書き込み（PUT/DELETE）
     * @param tableName テーブル名
     * @param requests 書き込みリクエスト配列
     * @returns バッチ処理結果
     */
    async batchWriteItems(
        tableName: string,
        requests: Array<{
            operation: 'PUT' | 'DELETE';
            item?: Record<string, any>;
            key?: Record<string, any>;
        }>
    ): Promise<{
        successful: number;
        failed: number;
        unprocessedItems?: any[];
    }> {
        try {
            const requestItems = {
                [tableName]: requests.map(req => {
                    if (req.operation === 'PUT' && req.item) {
                        return { PutRequest: { Item: req.item } };
                    } else if (req.operation === 'DELETE' && req.key) {
                        return { DeleteRequest: { Key: req.key } };
                    } else {
                        throw new Error('Invalid batch write request format');
                    }
                })
            };

            const command = new BatchWriteCommand({
                RequestItems: requestItems,
                ReturnConsumedCapacity: 'TOTAL'
            });

            const response = await this.docClient.send(command);
            const totalRequests = requests.length;
            const unprocessedItems = response.UnprocessedItems?.[tableName] || [];
            const successful = totalRequests - unprocessedItems.length;

            return {
                successful,
                failed: unprocessedItems.length,
                unprocessedItems
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to batch write items to ${tableName}: ${errorMessage}`);
        }
    }

    /**
     * バッチ取得
     * @param tableName テーブル名
     * @param keys 取得するキーの配列
     * @param projectionExpression 取得フィールド指定（オプション）
     * @returns バッチ取得結果
     */
    async batchGetItems(
        tableName: string,
        keys: Record<string, any>[],
        projectionExpression?: string
    ): Promise<{
        items: Record<string, any>[];
        unprocessedKeys?: Record<string, any>[];
    }> {
        try {
            const requestItems = {
                [tableName]: {
                    Keys: keys,
                    ProjectionExpression: projectionExpression
                }
            };

            const command = new BatchGetCommand({
                RequestItems: requestItems,
                ReturnConsumedCapacity: 'TOTAL'
            });

            const response = await this.docClient.send(command);
            const items = response.Responses?.[tableName] || [];
            const unprocessedKeys = response.UnprocessedKeys?.[tableName]?.Keys;

            return {
                items,
                unprocessedKeys
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to batch get items from ${tableName}: ${errorMessage}`);
        }
    }

    /**
     * TTL付きアイテムの挿入
     * @param tableName テーブル名
     * @param item アイテムデータ
     * @param ttlAttributeName TTL属性名
     * @param ttlSeconds TTL秒数（現在時刻からの相対時間）
     * @returns 実行結果
     */
    async putItemWithTtl(
        tableName: string,
        item: Record<string, any>,
        ttlAttributeName: string = 'ttl',
        ttlSeconds: number = 86400 // デフォルト24時間
    ): Promise<{ success: boolean; expirationTime: number }> {
        const expirationTime = Math.floor(Date.now() / 1000) + ttlSeconds;
        const itemWithTtl = {
            ...item,
            [ttlAttributeName]: expirationTime
        };

        const result = await this.putItem(tableName, itemWithTtl);
        return {
            ...result,
            expirationTime
        };
    }

    /**
     * 条件付きアトミック更新（楽観的ロック）
     * @param tableName テーブル名
     * @param key パーティションキー・ソートキー
     * @param updateExpression 更新式
     * @param expectedVersion 期待するバージョン
     * @param expressionAttributeValues 式の値
     * @returns 更新結果
     */
    async atomicUpdateWithVersion(
        tableName: string,
        key: Record<string, any>,
        updateExpression: string,
        expectedVersion: number,
        expressionAttributeValues?: Record<string, any>
    ): Promise<{ success: boolean; newVersion: number; attributes?: Record<string, any> }> {
        const newVersion = expectedVersion + 1;
        const conditionExpression = '#version = :expectedVersion';
        const finalUpdateExpression = `${updateExpression}, #version = :newVersion`;

        const finalExpressionAttributeValues = {
            ...expressionAttributeValues,
            ':expectedVersion': expectedVersion,
            ':newVersion': newVersion
        };

        try {
            const result = await this.updateItem(
                tableName,
                key,
                finalUpdateExpression,
                finalExpressionAttributeValues,
                conditionExpression
            );

            return {
                success: result.success,
                newVersion,
                attributes: result.attributes
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('ConditionalCheckFailedException')) {
                throw new Error(`Optimistic lock conflict: expected version ${expectedVersion}`);
            }
            throw error;
        }
    }

    /**
     * ページネーション付きクエリ（全件取得）
     * @param tableName テーブル名
     * @param keyConditionExpression キー条件式
     * @param filterExpression フィルタ式（オプション）
     * @param expressionAttributeValues 式の値
     * @param indexName インデックス名（オプション）
     * @returns 全件取得結果
     */
    async queryAllItems(
        tableName: string,
        keyConditionExpression: string,
        filterExpression?: string,
        expressionAttributeValues?: Record<string, any>,
        indexName?: string
    ): Promise<{
        items: Record<string, any>[];
        totalCount: number;
        totalScannedCount: number;
    }> {
        const allItems: Record<string, any>[] = [];
        let totalCount = 0;
        let totalScannedCount = 0;
        let lastEvaluatedKey: Record<string, any> | undefined;

        do {
            const command = new DocQueryCommand({
                TableName: tableName,
                KeyConditionExpression: keyConditionExpression,
                FilterExpression: filterExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                IndexName: indexName,
                ExclusiveStartKey: lastEvaluatedKey,
                ReturnConsumedCapacity: 'TOTAL'
            });

            const response = await this.docClient.send(command);
            
            if (response.Items) {
                allItems.push(...response.Items);
            }
            
            totalCount += response.Count || 0;
            totalScannedCount += response.ScannedCount || 0;
            lastEvaluatedKey = response.LastEvaluatedKey;

        } while (lastEvaluatedKey);

        return {
            items: allItems,
            totalCount,
            totalScannedCount
        };
    }

    /**
     * DynamoDBクライアントの終了
     */
    destroy(): void {
        this.dynamoClient.destroy();
    }
}