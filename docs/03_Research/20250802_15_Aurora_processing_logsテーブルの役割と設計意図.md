# Aurora processing_logsテーブルの役割と設計意図

## 1. テーブルの概要

`processing_logs`テーブルは、CSVファイルから読み取った各ユーザーのデータ処理履歴を記録する監査ログテーブルです。

### テーブル定義
```sql
CREATE TABLE processing_logs (
    log_id SERIAL PRIMARY KEY,
    execution_name VARCHAR(80) NOT NULL,
    user_id VARCHAR(10) REFERENCES users(user_id),
    processing_type VARCHAR(50),
    old_value INTEGER,
    new_value INTEGER,
    status VARCHAR(20),
    error_message TEXT,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 2. 主な役割

### 2.1 処理履歴の記録
- どのCSVファイル（execution_name）から
- どのユーザー（user_id）の
- どの統計値（login_count/post_count）を
- いつ更新したかを記録

### 2.2 更新内容の追跡
- `old_value`: 更新前の値
- `new_value`: 更新後の値
- `processing_type`: 'login_update' or 'post_update'
- これにより、データの変更履歴を追跡可能

### 2.3 処理状態の管理
- `status`: 'success', 'failed', 'skipped'
- 各行の処理が成功したか失敗したかを記録
- 失敗時は`error_message`にエラー詳細を保存

## 3. 利用シーン

### 3.1 監査・デバッグ用途
- 後から「いつ、どのファイルで、誰のデータがどう変わったか」を確認可能
- 処理の問題が発生した際の調査に使用
- データの整合性確認

### 3.2 運用上の利点
- 同じCSVファイルを誤って2回処理しても、履歴から確認可能
- ユーザーから「データがおかしい」という問い合わせがあった際の調査
- 日次・月次でどれだけのデータを処理したかの統計取得

## 4. 具体的な使用例

### 4.1 正常処理の記録例
```sql
INSERT INTO processing_logs (
    execution_name, 
    user_id, 
    processing_type, 
    old_value, 
    new_value, 
    status
) VALUES (
    'user-log-20250802-093000',
    'U00001',
    'login_update',
    10,  -- 前回のログイン回数
    12,  -- 新しいログイン回数（+2）
    'success'
);
```

### 4.2 エラー処理の記録例
```sql
INSERT INTO processing_logs (
    execution_name,
    user_id,
    processing_type,
    old_value,
    new_value,
    status,
    error_message
) VALUES (
    'user-log-20250802-093000',
    'U99999',
    'login_update',
    NULL,
    5,
    'failed',
    'User not found in users table'
);
```

## 5. 他のテーブルとの関係

### 5.1 DynamoDBとの役割分担
- **DynamoDB**: エラー情報のみを記録（TTL付き、30日で自動削除）
- **processing_logs**: 正常・エラー両方の全処理履歴を永続的に保存

### 5.2 user_statisticsテーブルとの関係
- `user_statistics`: 現在の最新値のみを保持
- `processing_logs`: 値の変更履歴をすべて保持

## 6. クエリ例

### 6.1 特定ユーザーの更新履歴確認
```sql
SELECT * FROM processing_logs 
WHERE user_id = 'U00001' 
ORDER BY processed_at DESC;
```

### 6.2 特定の実行での処理統計
```sql
SELECT 
    status,
    COUNT(*) as count,
    processing_type
FROM processing_logs 
WHERE execution_name = 'user-log-20250802-093000'
GROUP BY status, processing_type;
```

### 6.3 日次処理件数の確認
```sql
SELECT 
    DATE(processed_at) as process_date,
    COUNT(*) as total_processed,
    COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
FROM processing_logs
WHERE processed_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(processed_at)
ORDER BY process_date DESC;
```

## 7. 設計上の考慮事項

### 7.1 パフォーマンス
- インデックスを適切に設定（execution_name, user_id, status, processed_at）
- 古いデータのアーカイブ戦略（例：1年以上前のデータは別テーブルへ）

### 7.2 セキュリティ
- 個人情報（user_id）を含むため、アクセス制御が重要
- 監査ログは改ざん防止のため、UPDATE権限を制限

### 7.3 拡張性
- processing_typeは柔軟に拡張可能（将来的に他の統計値を追加する場合）
- JSONBカラムを追加して、より詳細なメタデータを保存することも可能

## 8. データ保存期間とアーカイブ戦略

### 8.1 推奨される保存戦略

監査ログの肥大化を防ぐため、以下の段階的な保存戦略を推奨します：

#### 基本保存期間：6ヶ月〜1年
個人開発で法的要件がない場合、実用的な保存期間として：
- **詳細ログ**: 6ヶ月（日常的な調査・デバッグ用）
- **完全データ**: 1年（年次統計・傾向分析用）

### 8.2 データ量の推定

```
- 1回の処理: 最大1,000行 × 2項目 = 2,000レコード
- 日次実行: 2,000 × 365日 = 年間73万レコード  
- データサイズ: 約150-200MB/年
```

### 8.3 段階的なデータ管理戦略

#### 8.3.1 ホットデータ（0-6ヶ月）
```sql
-- メインテーブルに保持
-- 全インデックス有効で高速アクセス可能
```

#### 8.3.2 ウォームデータ（6-12ヶ月）
```sql
-- パーティショニングで別パーティションに移動
CREATE TABLE processing_logs_2025_h1 PARTITION OF processing_logs
FOR VALUES FROM ('2025-01-01') TO ('2025-07-01');
```

#### 8.3.3 コールドデータ（1年以上）
```sql
-- 集計テーブルに変換して元データは削除
CREATE TABLE processing_logs_summary (
    summary_date DATE,
    execution_name VARCHAR(80),
    total_processed INTEGER,
    success_count INTEGER,
    failed_count INTEGER,
    PRIMARY KEY (summary_date, execution_name)
);

-- 月次集計を作成
INSERT INTO processing_logs_summary
SELECT 
    DATE_TRUNC('month', processed_at),
    execution_name,
    COUNT(*),
    COUNT(CASE WHEN status = 'success' THEN 1 END),
    COUNT(CASE WHEN status = 'failed' THEN 1 END)
FROM processing_logs
WHERE processed_at < CURRENT_DATE - INTERVAL '1 year'
GROUP BY DATE_TRUNC('month', processed_at), execution_name;
```

### 8.4 自動アーカイブの実装例

#### 8.4.1 定期的なアーカイブジョブ
```sql
-- 月次で実行するアーカイブ処理
CREATE OR REPLACE FUNCTION archive_old_logs() RETURNS void AS $$
BEGIN
    -- 1年以上前のデータを集計
    INSERT INTO processing_logs_summary
    SELECT 
        DATE_TRUNC('month', processed_at),
        execution_name,
        COUNT(*),
        COUNT(CASE WHEN status = 'success' THEN 1 END),
        COUNT(CASE WHEN status = 'failed' THEN 1 END)
    FROM processing_logs
    WHERE processed_at < CURRENT_DATE - INTERVAL '1 year'
    GROUP BY DATE_TRUNC('month', processed_at), execution_name;
    
    -- 元データを削除
    DELETE FROM processing_logs
    WHERE processed_at < CURRENT_DATE - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;
```

#### 8.4.2 S3へのエクスポート（オプション）
```python
# Lambda関数で月次アーカイブ
def export_to_s3():
    query = """
    COPY (SELECT * FROM processing_logs 
          WHERE processed_at < CURRENT_DATE - INTERVAL '1 year')
    TO STDOUT WITH CSV HEADER
    """
    # S3にアップロード後、テーブルから削除
```

### 8.5 コスト最適化のポイント

#### 8.5.1 Aurora Serverless v2のストレージコスト
- 月額 $0.10/GB なので、年間200MBでも$0.24程度
- ただし、インデックスも含めると実際は2-3倍

#### 8.5.2 代替案：DynamoDB TTL活用
```python
# 重要なログのみAuroraに保存
if error_occurred or important_change:
    save_to_aurora()
# 全ログはDynamoDBに保存（TTL: 90日）
save_to_dynamodb_with_ttl()
```

#### 8.5.3 ハイブリッドアプローチ
- エラーログ: 1年保存（Aurora）
- 正常ログ: 3ヶ月保存（DynamoDB + TTL）
- 統計サマリー: 永続保存（Aurora）

### 8.6 推奨実装（個人開発向け）

個人開発の場合、以下がバランスの良い実装です：

```sql
-- 6ヶ月以上前のデータを自動削除するイベント
CREATE EVENT IF NOT EXISTS cleanup_old_logs
ON SCHEDULE EVERY 1 WEEK
DO
  DELETE FROM processing_logs 
  WHERE processed_at < CURRENT_DATE - INTERVAL '6 months'
  LIMIT 10000;  -- バッチ削除で負荷軽減
```

この方法なら、常に直近6ヶ月分のデータのみ保持し、テーブルサイズを約40万レコード（約100MB）以下に抑えられます。

## まとめ

このテーブルがあることで、DynamoDB（エラー情報）とは別に、正常処理も含めたすべての更新履歴を保持でき、システムの透明性と追跡可能性が向上します。特に、ユーザーデータの変更履歴を完全に追跡できることは、運用上の問題解決やコンプライアンス対応において重要な役割を果たします。

ただし、適切なデータ保存期間の設定とアーカイブ戦略により、テーブルの肥大化を防ぎ、コストパフォーマンスの良い運用が可能となります。個人開発では6ヶ月の保存期間と自動削除の仕組みで十分な監査性を保ちつつ、管理コストを最小限に抑えることができます。