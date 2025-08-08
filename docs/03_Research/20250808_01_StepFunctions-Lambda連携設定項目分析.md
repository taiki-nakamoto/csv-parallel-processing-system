# Step Functions-Lambda連携における設定項目分析

## 概要

インフラメンバー（Step Functions担当）とアプリメンバー（Lambda担当）の分離開発における、設定整合性が必要な項目と効率的な連携方法の分析結果。

## 現状の密結合度評価

### 密結合レベル: **中程度（7/10）**

- ✅ **良い点**: 統合Lambda関数により関数数は最小限
- ⚠️ **問題点**: パラメータ名、構造、エラー処理の厳密な一致が必要
- ⚠️ **問題点**: 変更時は両チーム同時修正が必要

## 必須連携設定項目

### 1. 入力パラメータスキーマ

#### 🔴 Critical（変更時必ず両チーム調整必要）

```json
{
  "eventType": "string (必須)",           // Lambda内のルーティング用
  "bucketName": "string (必須)",          // S3操作用
  "objectKey": "string (必須)",           // S3操作用  
  "processingId": "string (必須)",        // トレーサビリティ用
  "batchId": "string (必須)"              // バッチ処理識別用
}
```

**現状の問題例:**
```javascript
// Step Functions側
"Parameters": {
  "eventType": "csv-chunk-processing",    // 固定文字列
  "bucketName.$": "$.fileMetadata.bucket"
}

// Lambda側
switch (eventType) {
  case 'csv-chunk-processing':           // 完全一致必須
    return await handleChunkProcessing();
}
```

#### 🟡 Medium（業務要件により変動）

```json
{
  "chunkIndex": "number",                // 並列処理用
  "totalChunks": "number",               // 並列処理用
  "processingMode": "string",            // single/distributed
  "items": "array",                      // 処理対象データ
  "executionContext": "object"          // 実行時メタデータ
}
```

### 2. 出力パラメータスキーマ

#### 🔴 Critical（Step Functions JSONPath参照用）

```json
{
  "statusCode": 200,                     // HTTP互換ステータス
  "processingId": "string",              // 入力と同じ値を返却
  "status": "VALID|INVALID|ERROR",       // 処理結果ステータス
  "timestamp": "ISO8601 string"          // 処理完了時刻
}
```

#### 🟡 Medium（業務データ）

```json
{
  "validationResult": {                  // CSV検証結果
    "isValid": "boolean",
    "errors": "array",
    "warnings": "array",
    "metadata": "object"
  },
  "chunkResults": {                      // チャンク処理結果
    "processedCount": "number",
    "successCount": "number",
    "errorCount": "number"
  }
}
```

### 3. エラーレスポンス統一

#### 🔴 Critical

```json
{
  "errorType": "string",                 // Step Functions Catch用
  "errorCode": "string",                 // アプリケーション用
  "errorMessage": "string",              // ユーザー向けメッセージ
  "isRetryable": "boolean",              // 再試行可能性
  "executionId": "string"                // トレーサビリティ用
}
```

## JSONPath参照の整合性

### 現状の問題例

```json
// Step Functions定義
"Variable": "$.fileMetadata.totalRows"  // パス構造が変わると動作不可

// Lambda出力
{
  "fileMetadata": {
    "totalRows": 100                     // 構造変更時は Step Functions側も修正必要
  }
}
```

## チーム間効率的連携方法

### 1. インターフェース定義ファーストアプローチ

#### A. 共通仕様書作成
```markdown
## Lambda関数インターフェース仕様

### 入力スキーマ (input-schema.json)
### 出力スキーマ (output-schema.json) 
### エラーレスポンススキーマ (error-schema.json)
```

#### B. スキーマファイル管理
```
/schemas/
  ├── lambda-input.schema.json
  ├── lambda-output.schema.json
  └── lambda-error.schema.json
```

### 2. 設定項目管理マトリックス

| 設定項目 | インフラ責任 | アプリ責任 | 合意方法 | 変更影響度 |
|---------|-------------|-----------|----------|-----------|
| eventType文字列 | 定義 | 実装 | 事前合意必須 | High |
| 入力パラメータ名 | 指定 | 受信 | スキーマ管理 | High |
| 出力JSONPath | 参照 | 構造定義 | スキーマ管理 | High |
| エラータイプ | Catch設定 | throw実装 | 事前合意必須 | Medium |
| タイムアウト設定 | 設定 | 処理時間考慮 | 性能要件合意 | Low |

### 3. 開発フロー

#### Phase 1: 設計フェーズ
1. **インターフェース仕様策定**（両チーム合同）
2. **JSONスキーマファイル作成**
3. **Step Functions設計書作成**（インフラ）
4. **Lambda設計書作成**（アプリ）

#### Phase 2: 実装フェーズ
1. **インフラ**: Step Functions Definition作成
2. **アプリ**: Lambda Handler実装
3. **両チーム**: スキーマバリデーション実装

#### Phase 3: テストフェーズ
1. **単体テスト**: 各チーム個別実施
2. **結合テスト**: 両チーム合同実施
3. **インターフェーステスト**: スキーマ準拠確認

## 推奨改善策

### 1. スキーマドリブン開発

```json
// lambda-interface.schema.json
{
  "input": {
    "type": "object",
    "required": ["eventType", "bucketName", "objectKey"],
    "properties": {
      "eventType": {
        "type": "string",
        "enum": ["csv-validation", "csv-chunk-processing", "csv-merge"]
      }
    }
  },
  "output": {
    "type": "object", 
    "required": ["statusCode", "status"],
    "properties": {
      "statusCode": {"type": "number"},
      "status": {"type": "string", "enum": ["VALID", "INVALID", "ERROR"]}
    }
  }
}
```

### 2. 型定義共有

```typescript
// shared-types.ts (両チーム共有)
export interface LambdaEvent {
  eventType: 'csv-validation' | 'csv-chunk-processing' | 'csv-merge';
  bucketName: string;
  objectKey: string;
  processingId: string;
  batchId: string;
}

export interface LambdaResponse {
  statusCode: number;
  status: 'VALID' | 'INVALID' | 'ERROR';
  timestamp: string;
  processingId: string;
}
```

### 3. 設定変更時の影響範囲明確化

#### High Impact（両チーム同時修正必須）
- eventType文字列
- 必須パラメータ名
- JSONPath参照構造

#### Medium Impact（事前調整必要）
- オプションパラメータ
- エラーコード
- タイムアウト設定

#### Low Impact（個別修正可能）
- ログレベル
- メトリクス項目
- 内部処理ロジック

## 結論

### 現状の問題点
1. **パラメータ名の厳密一致要求**
2. **JSONPath構造への強依存**
3. **エラーレスポンス形式の統一不足**

### 推奨対策
1. **スキーマファイルによるインターフェース管理**
2. **TypeScript型定義の共有**
3. **変更影響度による管理プロセス分離**

これらの対策により、チーム間の連携効率を大幅に改善可能。