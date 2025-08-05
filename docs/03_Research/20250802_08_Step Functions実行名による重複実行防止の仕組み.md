# Step Functions実行名による重複実行防止の仕組み

S3ファイル名をキーとしたStep Functions実行名による重複実行防止について、その効果、実装方法、制約事項を詳しく調査したドキュメントです。

## 1. Step Functions実行名の一意性制約

### 1.1 基本的な仕組み

Step Functionsでは、**同一ステートマシン内で同じ実行名を持つ実行を同時に起動することはできません**。

**制約の詳細:**
- 実行名は同一ステートマシン内でユニークである必要がある
- 実行が完了（SUCCESS、FAILED、ABORTED、TIMED_OUT）した後は、同じ名前で新しい実行を開始可能
- 実行中（RUNNING）の間は、同じ名前での新規実行はエラーになる

### 1.2 実行名の制約事項

**文字数制限:**
- 最小1文字、最大80文字
- 英数字、ハイフン（-）、アンダースコア（_）のみ使用可能
- 先頭と末尾は英数字である必要がある

**使用可能文字の正規表現:**
```
^[a-zA-Z0-9_-]+$
```

## 2. S3ファイル名をキーとした実行名生成パターン

### 2.1 基本的な変換パターン

#### 2.1.1 ファイル名の直接利用（制限あり）
```python
def generate_execution_name_basic(s3_key):
    """S3キーから基本的な実行名を生成"""
    # ファイル名のみを抽出
    filename = s3_key.split('/')[-1]
    
    # 拡張子を除去
    name_without_ext = filename.rsplit('.', 1)[0]
    
    # 無効な文字を置換
    execution_name = re.sub(r'[^a-zA-Z0-9_-]', '-', name_without_ext)
    
    # 80文字制限に合わせて切り詰め
    if len(execution_name) > 80:
        execution_name = execution_name[:80]
    
    # 先頭末尾が英数字になるよう調整
    execution_name = re.sub(r'^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$', '', execution_name)
    
    return execution_name

# 例
# S3キー: "uploads/data_2024-01-15_report.csv"
# 実行名: "data_2024-01-15_report"
```

#### 2.1.2 ハッシュ化による短縮
```python
import hashlib

def generate_execution_name_hash(s3_key):
    """S3キーのハッシュから実行名を生成"""
    # MD5ハッシュを生成（32文字）
    hash_value = hashlib.md5(s3_key.encode()).hexdigest()
    
    # プレフィックスを追加して識別しやすくする
    execution_name = f"file-{hash_value}"
    
    return execution_name

# 例
# S3キー: "uploads/very-long-filename-with-special-characters@#$.csv"
# 実行名: "file-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
```

#### 2.1.3 階層構造を考慮した命名
```python
def generate_execution_name_hierarchical(s3_key):
    """S3キーの階層構造を考慮した実行名を生成"""
    parts = s3_key.split('/')
    
    # パスの最後2階層とファイル名を使用
    if len(parts) >= 3:
        relevant_parts = parts[-3:]  # 例: ["folder", "subfolder", "file.csv"]
    else:
        relevant_parts = parts
    
    # 結合して実行名を作成
    combined = '-'.join(relevant_parts)
    
    # 拡張子を除去
    name_without_ext = combined.rsplit('.', 1)[0]
    
    # 無効な文字を置換
    execution_name = re.sub(r'[^a-zA-Z0-9_-]', '-', name_without_ext)
    
    # 80文字制限
    if len(execution_name) > 80:
        execution_name = execution_name[:80]
    
    return execution_name

# 例
# S3キー: "data/processing/batch1/customer_data_20240115.csv"
# 実行名: "processing-batch1-customer_data_20240115"
```

### 2.2 高度な実行名生成戦略

#### 2.2.1 タイムスタンプ付きユニーク名
```python
from datetime import datetime

def generate_execution_name_with_timestamp(s3_key):
    """タイムスタンプ付きで確実にユニークな実行名を生成"""
    # ファイル名の基本部分を抽出
    filename = s3_key.split('/')[-1]
    base_name = filename.rsplit('.', 1)[0]
    
    # 無効な文字を置換
    clean_name = re.sub(r'[^a-zA-Z0-9_-]', '-', base_name)
    
    # タイムスタンプを追加（ミリ秒まで）
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]
    
    # 結合（80文字制限を考慮）
    if len(clean_name) + len(timestamp) + 1 > 80:
        max_name_length = 80 - len(timestamp) - 1
        clean_name = clean_name[:max_name_length]
    
    execution_name = f"{clean_name}-{timestamp}"
    
    return execution_name

# 例
# S3キー: "uploads/daily_report.csv"
# 実行名: "daily_report-20240115-143052-123"
```

#### 2.2.2 事前チェック付き実行名生成
```python
import boto3

def generate_execution_name_with_check(state_machine_arn, s3_key):
    """実行中の重複をチェックして実行名を生成"""
    stepfunctions = boto3.client('stepfunctions')
    
    # 基本的な実行名を生成
    base_name = generate_execution_name_basic(s3_key)
    
    # 現在実行中の実行をチェック
    try:
        response = stepfunctions.list_executions(
            stateMachineArn=state_machine_arn,
            statusFilter='RUNNING'
        )
        
        running_names = {exec['name'] for exec in response['executions']}
        
        # 重複している場合はサフィックスを追加
        execution_name = base_name
        counter = 1
        
        while execution_name in running_names:
            suffix = f"-{counter:03d}"
            max_base_length = 80 - len(suffix)
            truncated_base = base_name[:max_base_length]
            execution_name = f"{truncated_base}{suffix}"
            counter += 1
            
            # 無限ループ防止
            if counter > 999:
                execution_name = generate_execution_name_with_timestamp(s3_key)
                break
        
        return execution_name
        
    except Exception as e:
        # エラー時はタイムスタンプ付きフォールバック
        return generate_execution_name_with_timestamp(s3_key)
```

## 3. 重複実行防止の効果と限界

### 3.1 防止できるケース

#### 3.1.1 EventBridgeイベントの重複配信
**シナリオ:**
```
S3ファイルアップロード → 同じファイルに対して複数のEventBridgeイベント発生
```

**効果:**
- 同じファイル名に対する同時実行を確実に防止
- 最初の実行のみが開始され、後続は`ExecutionAlreadyExists`エラーで失敗

#### 3.1.2 手動での重複実行防止
**シナリオ:**
```
運用者が誤って同じファイルに対して複数回手動実行を試行
```

**効果:**
- オペレーションミスによる重複処理を防止
- 明確なエラーメッセージで重複を通知

### 3.2 制限事項と対処できないケース

#### 3.2.1 実行完了後の再実行
**問題:**
```
1回目の実行が完了 → 同じファイル名で再実行可能
```

**対処法:**
```python
def check_previous_execution_status(state_machine_arn, execution_name):
    """過去の実行状況をチェック"""
    stepfunctions = boto3.client('stepfunctions')
    
    try:
        # 過去の実行履歴を確認
        response = stepfunctions.list_executions(
            stateMachineArn=state_machine_arn,
            maxResults=100
        )
        
        for execution in response['executions']:
            if execution['name'] == execution_name:
                if execution['status'] == 'SUCCEEDED':
                    return {'status': 'already_processed', 'execution': execution}
                elif execution['status'] in ['FAILED', 'ABORTED', 'TIMED_OUT']:
                    return {'status': 'failed_previously', 'execution': execution}
        
        return {'status': 'not_found'}
        
    except Exception as e:
        return {'status': 'error', 'message': str(e)}
```

#### 3.2.2 実行名の長さ制限による衝突
**問題:**
```
長いファイル名 → 80文字制限で切り詰め → 異なるファイルが同じ実行名
```

**対処法:**
```python
def generate_collision_resistant_name(s3_key):
    """衝突耐性のある実行名を生成"""
    # ファイル名が長い場合はハッシュを併用
    if len(s3_key) > 60:
        # ファイル名の一部 + ハッシュ
        filename = s3_key.split('/')[-1]
        base_part = re.sub(r'[^a-zA-Z0-9_-]', '-', filename[:30])
        hash_part = hashlib.md5(s3_key.encode()).hexdigest()[:16]
        execution_name = f"{base_part}-{hash_part}"
    else:
        execution_name = generate_execution_name_basic(s3_key)
    
    return execution_name
```

#### 3.2.3 異なるステートマシンでの重複
**問題:**
```
実行名の一意性はステートマシン単位のため、異なるステートマシンでは重複可能
```

**対処法:**
```python
def generate_global_unique_name(s3_key, state_machine_name):
    """グローバルに一意な実行名を生成"""
    # ステートマシン名をプレフィックスに追加
    sm_prefix = re.sub(r'[^a-zA-Z0-9_-]', '-', state_machine_name)[:20]
    file_part = generate_execution_name_basic(s3_key)
    
    max_file_length = 80 - len(sm_prefix) - 1
    if len(file_part) > max_file_length:
        file_part = file_part[:max_file_length]
    
    execution_name = f"{sm_prefix}-{file_part}"
    return execution_name
```

## 4. 実装例とベストプラクティス

### 4.1 EventBridge経由での実装

#### 4.1.1 EventBridgeルールでの実行名設定
```json
{
  "Name": "s3-to-stepfunctions-with-filename",
  "EventPattern": {
    "source": ["aws.s3"],
    "detail-type": ["S3 Bucket Notification"],
    "detail": {
      "eventSource": ["aws:s3"],
      "eventName": ["ObjectCreated:Put"]
    }
  },
  "Targets": [
    {
      "Id": "1",
      "Arn": "arn:aws:states:region:account:stateMachine:csv-processor",
      "RoleArn": "arn:aws:iam::account:role/EventBridgeExecutionRole",
      "StepFunctionsParameters": {
        "Input": "$.detail",
        "StateMachineArn": "arn:aws:states:region:account:stateMachine:csv-processor"
      },
      "HttpParameters": {
        "PathParameterValues": {},
        "QueryStringParameters": {},
        "HeaderParameters": {
          "X-Execution-Name": "$.detail.object.key"
        }
      }
    }
  ]
}
```

#### 4.1.2 Lambda経由での高度な制御
```python
import boto3
import json
import re
from datetime import datetime

def lambda_handler(event, context):
    """S3イベントを受け取りStep Functionsを起動"""
    
    stepfunctions = boto3.client('stepfunctions')
    
    # S3イベント情報を抽出
    s3_detail = event['detail']
    bucket_name = s3_detail['bucket']['name']
    object_key = s3_detail['object']['key']
    
    # 処理対象ファイルかチェック
    if not is_processable_file(object_key):
        return {'status': 'skipped', 'reason': 'not processable file'}
    
    # 実行名を生成
    execution_name = generate_execution_name_safe(object_key)
    
    # ステートマシンARN
    state_machine_arn = 'arn:aws:states:region:account:stateMachine:csv-processor'
    
    try:
        # Step Functions実行を開始
        response = stepfunctions.start_execution(
            stateMachineArn=state_machine_arn,
            name=execution_name,
            input=json.dumps({
                'bucket': bucket_name,
                'key': object_key,
                'eventTime': s3_detail['eventTime'],
                'executionName': execution_name
            })
        )
        
        return {
            'statusCode': 200,
            'executionArn': response['executionArn'],
            'executionName': execution_name,
            'status': 'started'
        }
        
    except stepfunctions.exceptions.ExecutionAlreadyExistsException:
        # 重複実行の場合
        return handle_duplicate_execution(state_machine_arn, execution_name, object_key)
        
    except Exception as e:
        # その他のエラー
        return {
            'statusCode': 500,
            'error': str(e),
            'executionName': execution_name
        }

def is_processable_file(object_key):
    """処理対象ファイルかチェック"""
    # CSVファイルのみ処理
    return object_key.lower().endswith('.csv') and not object_key.startswith('_')

def generate_execution_name_safe(s3_key):
    """安全な実行名を生成"""
    # ファイル名を抽出
    filename = s3_key.split('/')[-1]
    name_without_ext = filename.rsplit('.', 1)[0]
    
    # 無効文字を置換
    clean_name = re.sub(r'[^a-zA-Z0-9_-]', '-', name_without_ext)
    
    # 連続ハイフンを単一に
    clean_name = re.sub(r'-+', '-', clean_name)
    
    # 先頭末尾のハイフンを除去
    clean_name = clean_name.strip('-')
    
    # 80文字制限
    if len(clean_name) > 80:
        # ファイル名が長い場合は前半部分+ハッシュを使用
        prefix = clean_name[:40]
        hash_suffix = hashlib.md5(s3_key.encode()).hexdigest()[:16]
        clean_name = f"{prefix}-{hash_suffix}"
    
    # 空の場合のフォールバック
    if not clean_name:
        clean_name = f"file-{hashlib.md5(s3_key.encode()).hexdigest()[:16]}"
    
    return clean_name

def handle_duplicate_execution(state_machine_arn, execution_name, object_key):
    """重複実行時の処理"""
    stepfunctions = boto3.client('stepfunctions')
    
    try:
        # 実行中の状況を確認
        response = stepfunctions.list_executions(
            stateMachineArn=state_machine_arn,
            statusFilter='RUNNING'
        )
        
        for execution in response['executions']:
            if execution['name'] == execution_name:
                return {
                    'statusCode': 409,
                    'status': 'duplicate',
                    'message': 'Execution already running',
                    'runningExecutionArn': execution['executionArn'],
                    'startDate': execution['startDate'].isoformat()
                }
        
        # RUNNINGでない場合は完了済み実行が存在
        return {
            'statusCode': 409,
            'status': 'duplicate',
            'message': 'Execution with same name completed recently',
            'executionName': execution_name
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'error': f"Error checking duplicate execution: {str(e)}"
        }
```

### 4.2 モニタリングと運用

#### 4.2.1 重複実行の監視
```python
def monitor_duplicate_executions():
    """重複実行の発生状況を監視"""
    cloudwatch = boto3.client('cloudwatch')
    
    # CloudWatchカスタムメトリクスに記録
    cloudwatch.put_metric_data(
        Namespace='StepFunctions/Deduplication',
        MetricData=[
            {
                'MetricName': 'DuplicateExecutionAttempts',
                'Value': 1,
                'Unit': 'Count',
                'Dimensions': [
                    {
                        'Name': 'StateMachine',
                        'Value': 'csv-processor'
                    }
                ]
            }
        ]
    )
```

#### 4.2.2 実行名の衝突分析
```python
def analyze_execution_name_collisions(state_machine_arn, days=7):
    """実行名の衝突パターンを分析"""
    stepfunctions = boto3.client('stepfunctions')
    
    # 過去の実行履歴を取得
    end_time = datetime.now()
    start_time = end_time - timedelta(days=days)
    
    executions = []
    next_token = None
    
    while True:
        params = {
            'stateMachineArn': state_machine_arn,
            'maxResults': 100
        }
        if next_token:
            params['nextToken'] = next_token
            
        response = stepfunctions.list_executions(**params)
        executions.extend(response['executions'])
        
        next_token = response.get('nextToken')
        if not next_token:
            break
    
    # 実行名のパターン分析
    name_patterns = {}
    for execution in executions:
        if execution['startDate'] >= start_time:
            name = execution['name']
            pattern = extract_name_pattern(name)
            
            if pattern not in name_patterns:
                name_patterns[pattern] = []
            name_patterns[pattern].append(execution)
    
    # 衝突の可能性があるパターンを特定
    collision_risks = []
    for pattern, execs in name_patterns.items():
        if len(execs) > 1:
            collision_risks.append({
                'pattern': pattern,
                'count': len(execs),
                'executions': execs
            })
    
    return collision_risks

def extract_name_pattern(execution_name):
    """実行名からパターンを抽出"""
    # タイムスタンプやハッシュ部分を除去してパターンを抽出
    pattern = re.sub(r'-\d{8}-\d{6}-\d{3}$', '', execution_name)  # タイムスタンプ除去
    pattern = re.sub(r'-[a-f0-9]{16}$', '', pattern)  # ハッシュ除去
    return pattern
```

## 5. 代替手法との比較

### 5.1 DynamoDBによる排他制御

#### 5.1.1 条件付き書き込みによる制御
```python
def start_execution_with_dynamodb_lock(state_machine_arn, s3_key):
    """DynamoDBによる排他制御付きStep Functions実行"""
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table('stepfunctions-execution-locks')
    stepfunctions = boto3.client('stepfunctions')
    
    execution_name = generate_execution_name_basic(s3_key)
    lock_key = f"{state_machine_arn}#{execution_name}"
    
    try:
        # ロックの取得を試行
        table.put_item(
            Item={
                'lock_key': lock_key,
                'status': 'RUNNING',
                'started_at': datetime.utcnow().isoformat(),
                'ttl': int(time.time()) + 3600  # 1時間でTTL
            },
            ConditionExpression='attribute_not_exists(lock_key)'
        )
        
        # Step Functions実行を開始
        response = stepfunctions.start_execution(
            stateMachineArn=state_machine_arn,
            name=execution_name,
            input=json.dumps({'bucket': '...', 'key': s3_key})
        )
        
        return {'status': 'started', 'executionArn': response['executionArn']}
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return {'status': 'duplicate', 'message': 'Already processing'}
        raise
```

### 5.2 比較表

| 手法 | 実装複雑度 | 信頼性 | コスト | 制約事項 |
|------|-----------|--------|--------|----------|
| Step Functions実行名 | 低 | 高 | 無料 | 80文字制限、実行完了後再実行可能 |
| DynamoDB排他制御 | 中 | 高 | 低 | 追加サービス、TTL管理が必要 |
| SQS FIFO | 中 | 高 | 低 | メッセージ重複排除ID制限 |
| Lambda冪等性チェック | 高 | 中 | 低 | アプリケーションレベル実装 |

## 6. 推奨実装パターン

### 6.1 基本パターン（推奨）

```python
def recommended_execution_pattern(event, context):
    """推奨される実行パターン"""
    
    # 1. S3イベント情報の抽出
    s3_info = extract_s3_info(event)
    
    # 2. 処理対象ファイルかチェック
    if not is_target_file(s3_info['key']):
        return {'status': 'skipped'}
    
    # 3. 安全な実行名生成
    execution_name = generate_safe_execution_name(s3_info['key'])
    
    # 4. 重複チェック付きStep Functions実行
    result = start_execution_with_duplicate_check(
        state_machine_arn=STATE_MACHINE_ARN,
        execution_name=execution_name,
        input_data=s3_info
    )
    
    return result

def start_execution_with_duplicate_check(state_machine_arn, execution_name, input_data):
    """重複チェック付きでStep Functions実行を開始"""
    stepfunctions = boto3.client('stepfunctions')
    
    try:
        response = stepfunctions.start_execution(
            stateMachineArn=state_machine_arn,
            name=execution_name,
            input=json.dumps(input_data)
        )
        
        # 成功時のメトリクス記録
        record_execution_metric('started', execution_name)
        
        return {
            'status': 'started',
            'executionArn': response['executionArn'],
            'executionName': execution_name
        }
        
    except stepfunctions.exceptions.ExecutionAlreadyExistsException:
        # 重複実行のメトリクス記録
        record_execution_metric('duplicate', execution_name)
        
        return {
            'status': 'duplicate',
            'executionName': execution_name,
            'message': 'Execution already exists or running'
        }
```

## 7. まとめ

### 7.1 効果的なケース

Step Functions実行名による重複実行防止は、以下の条件で非常に効果的です：

1. **S3ファイル名が一意**: 前提条件として重要
2. **同時実行の防止**: EventBridge重複イベントに対して確実
3. **シンプルな実装**: 追加サービス不要で低コスト
4. **短いファイル名**: 80文字制限内での運用

### 7.2 制限事項への対策

- **長いファイル名**: ハッシュ化による短縮
- **実行完了後の再実行**: アプリケーションレベルでの処理状況チェック
- **異なるステートマシン**: グローバル命名規則の適用

### 7.3 運用推奨事項

1. **命名規則の標準化**: チーム内での一貫した実行名生成ルール
2. **監視の実装**: 重複実行の発生状況とパターンの監視
3. **テストの充実**: 各種エラーケースでの動作確認
4. **ドキュメント化**: 実行名生成ロジックの明文化

S3ファイル名をキーとしたStep Functions実行名による重複実行防止は、適切に実装すれば効果的な解決策となります。