# S3-EventBridgeトリガー実行のエラー処理と例外処理

S3とEventBridgeの連携において発生しうるエラーケースとその対処方法について、包括的に調査・整理したドキュメントです。イベント駆動型アーキテクチャの信頼性向上のために重要な考慮事項を詳しく解説します。

## 1. S3-EventBridge連携の基本フロー

### 1.1 正常フロー
```
S3バケット → S3イベント発生 → EventBridge → ルール評価 → ターゲット実行
```

### 1.2 関与するコンポーネント
1. **S3バケット**: イベントの発生源
2. **EventBridge**: イベントルーティングと配信
3. **EventBridgeルール**: イベントのフィルタリングとルーティング
4. **ターゲット**: Step Functions、Lambda、SQSなど

## 2. エラーケースの分類と詳細

### 2.1 S3側で発生するエラー

#### 2.1.1 EventBridge通知設定エラー
**エラーケース:**
- EventBridge通知が有効化されていない
- IAMアクセス許可が不足している
- リージョン間の設定不整合

**エラー例:**
```json
{
  "errorCode": "AccessDenied",
  "errorMessage": "S3 bucket does not have permission to publish events to EventBridge"
}
```

**対処方法:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowEventBridgeAccess",
      "Effect": "Allow",
      "Principal": {
        "Service": "s3.amazonaws.com"
      },
      "Action": "events:PutEvents",
      "Resource": "arn:aws:events:region:account-id:event-bus/*"
    }
  ]
}
```

#### 2.1.2 イベント発生失敗
**エラーケース:**
- S3操作が内部的に失敗
- オブジェクトサイズの制限超過
- 同時実行制限の達成

**症状:**
- イベントが一部のみ発生
- 遅延したイベント発生
- イベントの重複発生

### 2.2 EventBridge側で発生するエラー

#### 2.2.1 イベントパターンマッチング失敗
**エラーケース:**
- ルールパターンの記述ミス
- イベント構造の変更
- 大文字小文字の不一致

**問題のあるルール例:**
```json
{
  "source": ["aws.s3"],
  "detail-type": ["Object Created"],  // 実際は "S3 Bucket Notification"
  "detail": {
    "bucket": {
      "name": ["my-bucket"]
    },
    "object": {
      "key": [{
        "prefix": "uploads/"
      }]
    }
  }
}
```

**正しいルール例:**
```json
{
  "source": ["aws.s3"],
  "detail-type": ["S3 Bucket Notification"],
  "detail": {
    "eventSource": ["aws:s3"],
    "eventName": ["ObjectCreated:Put", "ObjectCreated:Post"],
    "requestParameters": {
      "bucketName": ["my-bucket"]
    },
    "responseElements": {
      "x-amz-request-id": [{"exists": true}]
    }
  }
}
```

#### 2.2.2 ターゲット呼び出し失敗
**エラーケース:**
- ターゲットサービスの一時的な障害
- IAM権限不足
- ターゲットサービスの制限超過
- デッドレターキューの設定不備

**エラー例:**
```json
{
  "errorCode": "InvocationFailure",
  "errorMessage": "Step Functions execution failed to start",
  "attemptNumber": 3,
  "retryDelay": "PT30S"
}
```

### 2.3 ネットワーク・インフラレベルのエラー

#### 2.3.1 ネットワーク分断
**エラーケース:**
- AZ間の通信障害
- リージョン間の接続問題
- VPCエンドポイントの設定問題

#### 2.3.2 AWS サービスの部分的障害
**エラーケース:**
- EventBridgeサービスの障害
- 依存サービスの障害
- API レート制限の達成

## 3. 詳細なエラーシナリオと対処法

### 3.1 イベント配信失敗シナリオ

#### 3.1.1 シナリオ1: Step Functions実行失敗
**状況:**
```
S3 → EventBridge → Step Functions (起動失敗)
```

**原因:**
- Step Functionsのステートマシンが無効
- IAMロールの権限不足
- ステートマシンのARN変更

**検出方法:**
```json
{
  "Rules": [
    {
      "Name": "StepFunctionStartFailure",
      "EventPattern": {
        "source": ["aws.events"],
        "detail-type": ["Scheduled Event"],
        "detail": {
          "state": ["FAILED"]
        }
      }
    }
  ]
}
```

**対処方法:**
```python
import boto3
import json

def handle_stepfunctions_failure(event, context):
    """Step Functions起動失敗時の処理"""
    
    # エラー詳細の抽出
    error_detail = event['detail']
    failure_reason = error_detail.get('failureReason', 'Unknown')
    
    # 再試行可能なエラーかチェック
    if is_retryable_error(failure_reason):
        return retry_execution(event)
    else:
        return escalate_to_ops_team(event)

def is_retryable_error(failure_reason):
    """再試行可能なエラーかどうかを判定"""
    retryable_errors = [
        'InternalServerError',
        'ServiceUnavailable',
        'ThrottlingException'
    ]
    return any(error in failure_reason for error in retryable_errors)

def retry_execution(event):
    """実行の再試行"""
    stepfunctions = boto3.client('stepfunctions')
    
    # 元の実行パラメータを再構築
    original_input = event['detail'].get('input', {})
    
    try:
        response = stepfunctions.start_execution(
            stateMachineArn=event['detail']['stateMachineArn'],
            input=json.dumps(original_input),
            name=f"retry-{int(time.time())}"
        )
        return {'status': 'retried', 'executionArn': response['executionArn']}
    except Exception as e:
        return escalate_to_ops_team(event, str(e))
```

#### 3.1.2 シナリオ2: イベント重複処理
**状況:**
```
S3で1つのファイルアップロード → 複数のEventBridgeイベント発生
```

**原因:**
- S3の内部的なリトライメカニズム
- 複数の操作（PUT + ACL変更など）
- EventBridgeの配信保証による重複

**対処方法（冪等性の実装）:**
```python
import hashlib
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('event-processing-log')

def process_s3_event_idempotent(event, context):
    """冪等性を保証したS3イベント処理"""
    
    # イベントの一意識別子を生成
    event_id = generate_event_id(event)
    
    # 既に処理済みかチェック
    if is_already_processed(event_id):
        return {'status': 'already_processed', 'eventId': event_id}
    
    try:
        # 実際の処理を実行
        result = execute_business_logic(event)
        
        # 処理完了を記録
        record_processing_completion(event_id, result)
        
        return {'status': 'completed', 'eventId': event_id, 'result': result}
        
    except Exception as e:
        # エラーを記録（再処理可能にするため完了は記録しない）
        record_processing_error(event_id, str(e))
        raise

def generate_event_id(event):
    """イベントから一意IDを生成"""
    s3_event = event['detail']
    
    # S3のイベント情報から一意キーを生成
    unique_key = f"{s3_event['bucket']['name']}#{s3_event['object']['key']}#{s3_event['eventTime']}"
    return hashlib.sha256(unique_key.encode()).hexdigest()

def is_already_processed(event_id):
    """既に処理済みかチェック"""
    try:
        response = table.get_item(Key={'event_id': event_id})
        return 'Item' in response and response['Item'].get('status') == 'completed'
    except Exception:
        return False

def record_processing_completion(event_id, result):
    """処理完了を記録"""
    table.put_item(
        Item={
            'event_id': event_id,
            'status': 'completed',
            'result': result,
            'timestamp': datetime.utcnow().isoformat(),
            'ttl': int(time.time()) + (7 * 24 * 60 * 60)  # 7日後に自動削除
        }
    )
```

### 3.2 大量イベント処理での制限超過

#### 3.2.1 EventBridge API制限超過
**制限値:**
- PutEvents: 10,000 イベント/秒/リージョン
- カスタムイベント: 10MB/秒/リージョン

**対処方法:**
```python
import time
from botocore.exceptions import ClientError

class EventBridgeRateLimiter:
    def __init__(self, max_requests_per_second=100):
        self.max_requests = max_requests_per_second
        self.requests = []
    
    def wait_if_needed(self):
        """必要に応じて待機"""
        now = time.time()
        
        # 1秒以内のリクエストをフィルタ
        self.requests = [req_time for req_time in self.requests if now - req_time < 1.0]
        
        if len(self.requests) >= self.max_requests:
            sleep_time = 1.0 - (now - self.requests[0])
            if sleep_time > 0:
                time.sleep(sleep_time)
        
        self.requests.append(now)

def send_events_with_backoff(events_client, events):
    """バックオフ付きでイベントを送信"""
    rate_limiter = EventBridgeRateLimiter()
    
    for event_batch in batch_events(events, 10):  # 10件ずつ処理
        rate_limiter.wait_if_needed()
        
        retry_count = 0
        max_retries = 3
        
        while retry_count < max_retries:
            try:
                response = events_client.put_events(Entries=event_batch)
                
                # 失敗したイベントがあるかチェック
                failed_events = [event for i, event in enumerate(event_batch) 
                               if response['Entries'][i].get('ErrorCode')]
                
                if failed_events:
                    # 失敗したイベントのみ再試行
                    event_batch = failed_events
                    retry_count += 1
                    time.sleep(2 ** retry_count)  # 指数バックオフ
                else:
                    break
                    
            except ClientError as e:
                if e.response['Error']['Code'] == 'ThrottlingException':
                    retry_count += 1
                    time.sleep(2 ** retry_count)
                else:
                    raise
```

## 4. 監視とアラートの設定

### 4.1 CloudWatch Metrics

#### 4.1.1 EventBridge関連メトリクス
```json
{
  "MetricFilters": [
    {
      "filterName": "EventBridge-MatchedRules",
      "metricTransformations": [
        {
          "metricName": "MatchedRules",
          "metricNamespace": "EventBridge/Rules",
          "metricValue": "1"
        }
      ]
    },
    {
      "filterName": "EventBridge-FailedInvocations",
      "metricTransformations": [
        {
          "metricName": "FailedInvocations",
          "metricNamespace": "EventBridge/Targets",
          "metricValue": "1"
        }
      ]
    }
  ]
}
```

#### 4.1.2 カスタムメトリクス
```python
import boto3

cloudwatch = boto3.client('cloudwatch')

def send_custom_metrics(metric_name, value, unit='Count', dimensions=None):
    """カスタムメトリクスを送信"""
    try:
        cloudwatch.put_metric_data(
            Namespace='S3EventProcessing',
            MetricData=[
                {
                    'MetricName': metric_name,
                    'Value': value,
                    'Unit': unit,
                    'Dimensions': dimensions or []
                }
            ]
        )
    except Exception as e:
        print(f"Failed to send metrics: {e}")

# 使用例
send_custom_metrics(
    metric_name='ProcessingLatency',
    value=processing_time_ms,
    unit='Milliseconds',
    dimensions=[
        {'Name': 'BucketName', 'Value': bucket_name},
        {'Name': 'EventType', 'Value': event_type}
    ]
)
```

### 4.2 CloudWatch Alarms

#### 4.2.1 EventBridge障害検知
```json
{
  "AlarmName": "EventBridge-HighFailureRate",
  "MetricName": "FailedInvocations",
  "Namespace": "AWS/Events",
  "Statistic": "Sum",
  "Period": 300,
  "EvaluationPeriods": 2,
  "Threshold": 10,
  "ComparisonOperator": "GreaterThanThreshold",
  "AlarmActions": [
    "arn:aws:sns:region:account:topic:eventbridge-alerts"
  ],
  "AlarmDescription": "EventBridge target invocation failures are high"
}
```

#### 4.2.2 処理遅延検知
```json
{
  "AlarmName": "S3Event-ProcessingDelay",
  "MetricName": "ProcessingLatency",
  "Namespace": "S3EventProcessing",
  "Statistic": "Average",
  "Period": 600,
  "EvaluationPeriods": 2,
  "Threshold": 30000,
  "ComparisonOperator": "GreaterThanThreshold",
  "AlarmActions": [
    "arn:aws:sns:region:account:topic:processing-alerts"
  ]
}
```

### 4.3 CloudWatch Logs Insights

#### 4.3.1 エラー分析クエリ
```sql
-- EventBridgeルールマッチング失敗の分析
fields @timestamp, @message
| filter @message like /FAILED/
| parse @message "RuleName: (?<rule_name>\\S+)"
| stats count() by rule_name
| sort count desc
```

```sql
-- S3イベント処理の遅延分析
fields @timestamp, @duration
| filter @type = "REPORT"
| stats avg(@duration), max(@duration), min(@duration) by bin(5m)
```

## 5. デッドレターキューとエラー回復

### 5.1 DLQ設定

#### 5.1.1 EventBridgeルールでのDLQ設定
```json
{
  "Name": "s3-to-stepfunctions",
  "EventPattern": {
    "source": ["aws.s3"],
    "detail-type": ["S3 Bucket Notification"]
  },
  "Targets": [
    {
      "Id": "1",
      "Arn": "arn:aws:states:region:account:stateMachine:csv-processor",
      "RoleArn": "arn:aws:iam::account:role/EventBridgeExecutionRole",
      "DeadLetterConfig": {
        "Arn": "arn:aws:sqs:region:account:queue:eventbridge-dlq"
      },
      "RetryPolicy": {
        "MaximumRetryAttempts": 3,
        "MaximumEventAge": 3600
      }
    }
  ]
}
```

#### 5.1.2 DLQメッセージ処理
```python
import json
import boto3
from datetime import datetime, timedelta

def process_dlq_messages(event, context):
    """DLQメッセージの処理"""
    
    for record in event['Records']:
        try:
            # DLQメッセージの解析
            message_body = json.loads(record['body'])
            failed_event = json.loads(message_body['Message'])
            
            # 失敗原因の分析
            failure_reason = analyze_failure_reason(failed_event)
            
            # 回復可能なエラーかチェック
            if is_recoverable_error(failure_reason):
                schedule_retry(failed_event)
            else:
                escalate_to_manual_review(failed_event, failure_reason)
                
        except Exception as e:
            # DLQ処理自体の失敗をログ記録
            log_dlq_processing_failure(record, str(e))

def analyze_failure_reason(failed_event):
    """失敗原因を分析"""
    error_code = failed_event.get('errorCode')
    error_message = failed_event.get('errorMessage', '')
    
    if error_code == 'ThrottlingException':
        return 'THROTTLING'
    elif 'ResourceNotFoundException' in error_message:
        return 'RESOURCE_NOT_FOUND'
    elif 'AccessDeniedException' in error_message:
        return 'PERMISSION_ERROR'
    else:
        return 'UNKNOWN_ERROR'

def schedule_retry(failed_event):
    """失敗したイベントの再試行をスケジュール"""
    sqs = boto3.client('sqs')
    
    # 少し遅延させて再試行キューに送信
    retry_delay = 300  # 5分後
    
    sqs.send_message(
        QueueUrl='https://sqs.region.amazonaws.com/account/retry-queue',
        MessageBody=json.dumps(failed_event),
        DelaySeconds=retry_delay
    )
```

### 5.2 エラー回復戦略

#### 5.2.1 段階的回復アプローチ
```python
class ErrorRecoveryManager:
    def __init__(self):
        self.max_retry_attempts = 3
        self.retry_delays = [60, 300, 900]  # 1分、5分、15分
    
    def handle_failed_event(self, event, attempt_count=0):
        """失敗したイベントの処理"""
        
        if attempt_count >= self.max_retry_attempts:
            return self.escalate_to_manual_intervention(event)
        
        failure_type = self.classify_failure(event)
        
        if failure_type == 'TRANSIENT':
            return self.schedule_retry(event, attempt_count)
        elif failure_type == 'CONFIGURATION':
            return self.attempt_auto_remediation(event)
        else:
            return self.escalate_to_manual_intervention(event)
    
    def classify_failure(self, event):
        """失敗の種類を分類"""
        error_message = event.get('errorMessage', '')
        
        transient_errors = [
            'ThrottlingException',
            'InternalServerError',
            'ServiceUnavailable'
        ]
        
        config_errors = [
            'ResourceNotFoundException',
            'InvalidParameterValue'
        ]
        
        for error in transient_errors:
            if error in error_message:
                return 'TRANSIENT'
        
        for error in config_errors:
            if error in error_message:
                return 'CONFIGURATION'
        
        return 'PERMANENT'
    
    def attempt_auto_remediation(self, event):
        """自動修復の試行"""
        # 設定エラーの場合、自動的に修正を試行
        if 'ResourceNotFoundException' in event.get('errorMessage', ''):
            return self.recreate_missing_resource(event)
        
        return False
```

## 6. ベストプラクティス

### 6.1 設計時の考慮事項

#### 6.1.1 冪等性の確保
- 同じイベントが複数回処理されても結果が一貫する設計
- 一意識別子によるイベント重複検知
- 処理状況の永続化

#### 6.1.2 障害分離
- コンポーネント間の疎結合
- サーキットブレーカーパターンの実装
- 部分的障害の影響範囲限定

#### 6.1.3 観測可能性
- 包括的なログ記録
- メトリクス収集
- 分散トレーシング

### 6.2 運用時のベストプラクティス

#### 6.2.1 プロアクティブ監視
```python
def health_check_eventbridge_integration():
    """EventBridge統合のヘルスチェック"""
    
    checks = {
        'eventbridge_rules': check_rule_status(),
        'target_availability': check_target_availability(),
        'dlq_message_count': check_dlq_message_count(),
        'processing_latency': check_processing_latency()
    }
    
    overall_health = all(checks.values())
    
    return {
        'status': 'healthy' if overall_health else 'unhealthy',
        'checks': checks,
        'timestamp': datetime.utcnow().isoformat()
    }

def check_rule_status():
    """EventBridgeルールの状態確認"""
    events_client = boto3.client('events')
    
    try:
        rules = events_client.list_rules()
        disabled_rules = [rule for rule in rules['Rules'] if rule['State'] == 'DISABLED']
        return len(disabled_rules) == 0
    except Exception:
        return False
```

#### 6.2.2 定期的な設定検証
```python
def validate_configuration():
    """設定の妥当性を検証"""
    
    validations = [
        validate_iam_permissions(),
        validate_eventbridge_rules(),
        validate_target_configurations(),
        validate_dlq_setup()
    ]
    
    return all(validations)

def validate_iam_permissions():
    """IAM権限の検証"""
    # S3からEventBridgeへの権限確認
    # EventBridgeからターゲットへの権限確認
    pass

def validate_eventbridge_rules():
    """EventBridgeルールの検証"""
    # ルールパターンの正確性確認
    # ターゲット設定の確認
    pass
```

## 7. トラブルシューティングガイド

### 7.1 よくある問題と解決方法

#### 7.1.1 イベントが発生しない
**チェックポイント:**
1. S3バケットのEventBridge通知が有効化されているか
2. IAM権限が適切に設定されているか
3. EventBridgeルールが有効になっているか

**調査コマンド:**
```bash
# S3バケット通知設定の確認
aws s3api get-bucket-notification-configuration --bucket my-bucket

# EventBridgeルールの確認
aws events list-rules --name-prefix s3-

# IAMポリシーの確認
aws iam get-role-policy --role-name EventBridgeExecutionRole --policy-name S3AccessPolicy
```

#### 7.1.2 イベントが処理されない
**チェックポイント:**
1. EventBridgeルールパターンが正しいか
2. ターゲットサービスが利用可能か
3. DLQにメッセージが蓄積されていないか

**調査方法:**
```python
def diagnose_event_processing():
    """イベント処理の診断"""
    
    # CloudWatch Logsでイベント配信状況を確認
    logs_client = boto3.client('logs')
    
    query = """
    fields @timestamp, @message
    | filter @message like /FAILED/
    | sort @timestamp desc
    | limit 20
    """
    
    response = logs_client.start_query(
        logGroupName='/aws/events/rule/s3-to-stepfunctions',
        startTime=int((datetime.now() - timedelta(hours=1)).timestamp()),
        endTime=int(datetime.now().timestamp()),
        queryString=query
    )
    
    return response
```

## 8. まとめ

### 8.1 重要なポイント

1. **多層防御**: S3、EventBridge、ターゲットサービスの各レベルでエラーハンドリング
2. **冪等性**: 重複イベントに対する適切な処理
3. **監視**: プロアクティブな問題検知とアラート
4. **回復性**: DLQと自動回復メカニズムの活用
5. **可視性**: 包括的なログ記録とメトリクス収集

### 8.2 運用における推奨事項

- **段階的な導入**: 小規模なテストから開始
- **継続的な監視**: メトリクスとアラートの定期的な見直し
- **文書化**: トラブルシューティング手順の明文化
- **テスト**: 障害シナリオの定期的なテスト実行

適切なエラー処理と例外処理の実装により、S3-EventBridge連携は高い信頼性と可用性を持つイベント駆動型アーキテクチャの基盤となります。