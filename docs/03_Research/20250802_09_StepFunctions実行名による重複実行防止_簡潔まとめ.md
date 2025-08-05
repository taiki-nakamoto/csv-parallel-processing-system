# Step Functions実行名による重複実行防止 - 簡潔まとめ

## Q: ステートマシン名は固定か変数化できるのか？

**A: 固定です。**

- ステートマシン名は作成時に決定され、後から変更不可
- ARN形式: `arn:aws:states:region:account:stateMachine:csv-processor`
- `csv-processor`部分がステートマシン名（固定）

## Q: EventBridgeから2重起動された場合の動作は？

**A: 2回目の起動は失敗します。**

### 動作フロー
```
同じS3ファイル → EventBridge重複イベント → 同じ実行名で2回起動試行
```

### 結果
1. **1回目**: `start_execution`成功 → RUNNING状態
2. **2回目**: `ExecutionAlreadyExistsException`エラーで失敗

### 実際のエラー例
```json
{
  "errorType": "ExecutionAlreadyExistsException", 
  "errorMessage": "Execution Already Exists: 'data-20240115-report'"
}
```

## 結論

✅ **固定のステートマシン名**  
✅ **同じ実行名での重複起動は失敗**  
✅ **EventBridge重複イベントから自動的に保護される**  

**→ S3ファイル名をキーとした実行名は確実に重複実行を防止できる**

### 補足説明

**なぜ確実に防止できるのか？**

1. **S3ファイル名が一意** → **実行名も一意**
   ```
   S3ファイル: "data-20240115.csv" → 実行名: "data-20240115"
   ```

2. **Step Functionsの制約**
   - 同一ステートマシン内で同じ実行名は同時に存在できない
   - 既に同じ名前の実行がRUNNINGの場合、新しい実行は起動できない

3. **具体例**
   ```
   ファイル: "report-2024.csv"がアップロード
   ↓
   EventBridgeが重複でイベント発生（バグやリトライで2回）
   ↓
   1回目: 実行名"report-2024"で起動 → 成功（RUNNING状態）
   2回目: 実行名"report-2024"で起動 → 失敗（既に存在するため）
   ```

4. **結果**
   - 同じファイルに対して複数の処理が同時実行されることはない
   - 1つのファイルに対して必ず1つの処理のみが実行される

**前提条件:** S3にアップロードされるファイル名が一意であること