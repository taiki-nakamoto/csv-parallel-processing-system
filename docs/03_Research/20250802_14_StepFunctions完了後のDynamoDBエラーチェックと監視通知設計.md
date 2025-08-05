# Step Functions完了後のDynamoDBエラーチェックと監視通知設計

## 1. 要件整理

### 1.1 実現したいこと
- Step Functionsのすべての処理が完了した後
- Lambdaで特定のクラス（エラーチェック機能）を実行
- DynamoDBにエラー内容があるかチェック
- エラーがあれば監視通知を送信

### 1.2 前提条件
- LambdaでCSVデータ処理中にエラーが発生した場合、DynamoDBにエラー情報を記録済み
- DynamoDBのエラーテーブル構造が定義済み

## 2. 実現可能性

**結論: 完全に実現可能です。**

### 2.1 Step Functionsでの実装方法

#### パターン1: 最終ステートとしてエラーチェックを追加
```json
{
  "Comment": "CSV並列処理ワークフロー with エラーチェック",
  "StartAt": "CSV分割処理",
  "States": {
    "CSV分割処理": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:region:account:function:split-csv",
      "Next": "分散マップ処理"
    },
    "分散マップ処理": {
      "Type": "Map",
      "Mode": "DISTRIBUTED",
      "ItemProcessor": {
        "StartAt": "チャンク処理",
        "States": {
          "チャンク処理": {
            "Type": "Task",
            "Resource": "arn:aws:lambda:region:account:function:process-chunk",
            "End": true
          }
        }
      },
      "Next": "エラーチェックと通知"
    },
    "エラーチェックと通知": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:region:account:function:check-errors-and-notify",
      "End": true
    }
  }
}
```

#### パターン2: Parallel実行で結果集約とエラーチェックを並行実行
```json
{
  "結果処理": {
    "Type": "Parallel",
    "Branches": [
      {
        "StartAt": "結果集約",
        "States": {
          "結果集約": {
            "Type": "Task",
            "Resource": "arn:aws:lambda:region:account:function:aggregate-results",
            "End": true
          }
        }
      },
      {
        "StartAt": "エラーチェック",
        "States": {
          "エラーチェック": {
            "Type": "Task",
            "Resource": "arn:aws:lambda:region:account:function:check-errors-and-notify",
            "End": true
          }
        }
      }
    ],
    "Next": "完了"
  }
}
```

## 3. Lambdaでのエラーチェックと通知実装

### 3.1 エラーチェック用Lambda関数

```python
import boto3
import json
from datetime import datetime, timezone
from typing import List, Dict, Any

def lambda_handler(event, context):
    """
    DynamoDBのエラーをチェックして通知を送信する
    """
    try:
        # Step Functionsから渡された実行情報を取得
        execution_info = extract_execution_info(event)
        
        # DynamoDBからエラーを取得
        error_records = get_error_records(execution_info)
        
        if error_records:
            # エラーが存在する場合
            notification_result = send_error_notification(error_records, execution_info)
            
            return {
                'statusCode': 200,
                'hasErrors': True,
                'errorCount': len(error_records),
                'notificationSent': notification_result['success'],
                'errors': error_records
            }
        else:
            # エラーなしの場合
            send_success_notification(execution_info)
            
            return {
                'statusCode': 200,
                'hasErrors': False,
                'errorCount': 0,
                'message': 'All records processed successfully'
            }
            
    except Exception as e:
        # エラーチェック自体の失敗
        send_critical_error_notification(str(e), execution_info)
        raise

def extract_execution_info(event):
    """Step Functionsから実行情報を抽出"""
    return {
        'executionArn': event.get('executionArn', 'unknown'),
        'executionName': event.get('executionName', 'unknown'),
        'inputBucket': event.get('bucket', 'unknown'),
        'inputKey': event.get('key', 'unknown'),
        'startTime': event.get('startTime', datetime.now(timezone.utc).isoformat())
    }

def get_error_records(execution_info) -> List[Dict[str, Any]]:
    """DynamoDBからエラーレコードを取得"""
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table('csv-processing-errors')
    
    # GSI (Global Secondary Index) でexecutionNameによる検索
    response = table.query(
        IndexName='ExecutionName-index',
        KeyConditionExpression='executionName = :exec_name',
        ExpressionAttributeValues={
            ':exec_name': execution_info['executionName']
        }
    )
    
    return response.get('Items', [])

def send_error_notification(error_records: List[Dict], execution_info: Dict):
    """エラー通知を送信"""
    
    # エラーの分析
    error_summary = analyze_errors(error_records)
    
    # 通知メッセージを作成
    message = create_error_notification_message(error_summary, execution_info)
    
    # 複数の通知チャネルに送信
    results = {
        'sns': send_sns_notification(message),
        'slack': send_slack_notification(message),
        'email': send_email_notification(message)
    }
    
    # CloudWatchカスタムメトリクスに記録
    send_error_metrics(error_summary, execution_info)
    
    return {
        'success': any(results.values()),
        'results': results,
        'errorSummary': error_summary
    }

def analyze_errors(error_records: List[Dict]) -> Dict[str, Any]:
    """エラーを分析して概要を作成"""
    error_types = {}
    critical_errors = []
    
    for error in error_records:
        error_type = error.get('errorType', 'Unknown')
        severity = error.get('severity', 'MEDIUM')
        
        # エラータイプ別の集計
        if error_type not in error_types:
            error_types[error_type] = 0
        error_types[error_type] += 1
        
        # 重要なエラーの抽出
        if severity in ['HIGH', 'CRITICAL']:
            critical_errors.append(error)
    
    return {
        'totalErrors': len(error_records),
        'errorTypes': error_types,
        'criticalErrors': critical_errors,
        'criticalCount': len(critical_errors)
    }

def create_error_notification_message(error_summary: Dict, execution_info: Dict) -> str:
    """通知メッセージを作成"""
    
    message = f"""
🚨 **CSV処理エラー通知**

**実行情報:**
- 実行名: {execution_info['executionName']}
- ファイル: s3://{execution_info['inputBucket']}/{execution_info['inputKey']}
- 開始時刻: {execution_info['startTime']}

**エラー概要:**
- 総エラー数: {error_summary['totalErrors']}件
- 重要エラー数: {error_summary['criticalCount']}件

**エラータイプ別内訳:**
"""
    
    for error_type, count in error_summary['errorTypes'].items():
        message += f"- {error_type}: {count}件\n"
    
    if error_summary['criticalErrors']:
        message += "\n**重要なエラー詳細:**\n"
        for error in error_summary['criticalErrors'][:5]:  # 最大5件表示
            message += f"- {error.get('errorMessage', 'Unknown error')}\n"
    
    message += f"\n**対応要求:** 至急確認をお願いします"
    
    return message

def send_sns_notification(message: str) -> bool:
    """SNS通知を送信"""
    try:
        sns = boto3.client('sns')
        
        response = sns.publish(
            TopicArn='arn:aws:sns:region:account:csv-processing-errors',
            Subject='CSV処理エラー発生',
            Message=message
        )
        
        return True
    except Exception as e:
        print(f"SNS通知送信失敗: {e}")
        return False

def send_slack_notification(message: str) -> bool:
    """Slack通知を送信"""
    try:
        # Slack Webhook URLを使用した通知
        import urllib3
        import json
        
        slack_webhook_url = get_slack_webhook_url()
        
        payload = {
            'text': message,
            'channel': '#csv-processing-alerts',
            'username': 'CSV処理監視'
        }
        
        http = urllib3.PoolManager()
        response = http.request(
            'POST',
            slack_webhook_url,
            body=json.dumps(payload),
            headers={'Content-Type': 'application/json'}
        )
        
        return response.status == 200
    except Exception as e:
        print(f"Slack通知送信失敗: {e}")
        return False

def send_email_notification(message: str) -> bool:
    """Email通知を送信"""
    try:
        ses = boto3.client('ses')
        
        response = ses.send_email(
            Source='noreply@your-domain.com',
            Destination={
                'ToAddresses': ['admin@your-domain.com']
            },
            Message={
                'Subject': {'Data': 'CSV処理エラー発生'},
                'Body': {'Text': {'Data': message}}
            }
        )
        
        return True
    except Exception as e:
        print(f"Email通知送信失敗: {e}")
        return False

def send_error_metrics(error_summary: Dict, execution_info: Dict):
    """CloudWatchカスタムメトリクスを送信"""
    cloudwatch = boto3.client('cloudwatch')
    
    try:
        cloudwatch.put_metric_data(
            Namespace='CSV/Processing',
            MetricData=[
                {
                    'MetricName': 'ErrorCount',
                    'Value': error_summary['totalErrors'],
                    'Unit': 'Count',
                    'Dimensions': [
                        {'Name': 'ExecutionName', 'Value': execution_info['executionName']}
                    ]
                },
                {
                    'MetricName': 'CriticalErrorCount',
                    'Value': error_summary['criticalCount'],
                    'Unit': 'Count',
                    'Dimensions': [
                        {'Name': 'ExecutionName', 'Value': execution_info['executionName']}
                    ]
                }
            ]
        )
    except Exception as e:
        print(f"メトリクス送信失敗: {e}")

def send_success_notification(execution_info: Dict):
    """成功時の通知を送信"""
    message = f"""
✅ **CSV処理完了通知**

**実行情報:**
- 実行名: {execution_info['executionName']}
- ファイル: s3://{execution_info['inputBucket']}/{execution_info['inputKey']}
- 結果: 全件正常処理完了

**状況:** エラーなく処理が完了しました
"""
    
    # 成功時は軽い通知のみ（Slackのみなど）
    send_slack_notification(message)

def get_slack_webhook_url() -> str:
    """Slack Webhook URLを取得（AWS Systems Manager Parameter Storeから）"""
    ssm = boto3.client('ssm')
    
    try:
        response = ssm.get_parameter(
            Name='/csv-processing/slack/webhook-url',
            WithDecryption=True
        )
        return response['Parameter']['Value']
    except Exception:
        # フォールバック用のデフォルトURL
        return 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'

def send_critical_error_notification(error_message: str, execution_info: Dict):
    """エラーチェック自体が失敗した場合の緊急通知"""
    critical_message = f"""
🆘 **緊急: CSV処理監視システムエラー**

エラーチェック機能自体に問題が発生しました。

**エラー詳細:** {error_message}
**実行情報:** {execution_info}

**対応要求:** システム管理者による緊急対応が必要です
"""
    
    # 緊急時はSNSで確実に通知
    send_sns_notification(critical_message)
```

### 3.2 DynamoDBエラーテーブル設計

```python
# エラーテーブルの想定構造
{
    'errorId': 'uuid',           # パーティションキー
    'executionName': 'string',   # GSI用
    'timestamp': 'string',       # ソートキー
    'errorType': 'string',       # ValidationError, ProcessingError等
    'severity': 'string',        # LOW, MEDIUM, HIGH, CRITICAL
    'errorMessage': 'string',    # エラーメッセージ
    'recordData': 'map',         # エラーが発生したレコードのデータ
    'stackTrace': 'string',      # スタックトレース（オプション）
    'retryCount': 'number',      # リトライ回数
    'processingStage': 'string'  # どの処理段階でエラーが発生したか
}
```

## 4. 監視とアラートの設定

### 4.1 CloudWatch Alarms設定

```json
{
  "AlarmName": "CSV-Processing-Errors-High",
  "MetricName": "ErrorCount",
  "Namespace": "CSV/Processing", 
  "Statistic": "Sum",
  "Period": 300,
  "EvaluationPeriods": 1,
  "Threshold": 10,
  "ComparisonOperator": "GreaterThanThreshold",
  "AlarmActions": [
    "arn:aws:sns:region:account:csv-processing-critical-alerts"
  ],
  "AlarmDescription": "CSV処理でエラーが10件を超えた場合"
}
```

### 4.2 CloudWatch Dashboard

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["CSV/Processing", "ErrorCount"],
          ["CSV/Processing", "CriticalErrorCount"],
          ["AWS/StepFunctions", "ExecutionsSucceeded", "StateMachineArn", "arn:aws:states:region:account:stateMachine:csv-processor"],
          ["AWS/StepFunctions", "ExecutionsFailed", "StateMachineArn", "arn:aws:states:region:account:stateMachine:csv-processor"]
        ],
        "period": 300,
        "stat": "Sum",
        "region": "region",
        "title": "CSV Processing Status"
      }
    }
  ]
}
```

### 4.3 ログ監視

```python
# CloudWatch Logs Insightsクエリ例
def create_error_analysis_query():
    return """
    fields @timestamp, @message, errorType, severity
    | filter @message like /ERROR/
    | stats count() by errorType, severity
    | sort count desc
    """

# カスタムメトリクスフィルター
def setup_log_metric_filters():
    """ログからメトリクスを抽出するフィルターを設定"""
    cloudwatch = boto3.client('logs')
    
    # 重要エラーのメトリクスフィルター
    cloudwatch.put_metric_filter(
        logGroupName='/aws/lambda/check-errors-and-notify',
        filterName='CriticalErrors',
        filterPattern='[timestamp, request_id, "CRITICAL"]',
        metricTransformations=[
            {
                'metricName': 'CriticalErrorDetected',
                'metricNamespace': 'CSV/Processing',
                'metricValue': '1'
            }
        ]
    )
```

## 5. 運用フロー

### 5.1 正常時の処理フロー
```
1. Step Functions分散マップ処理完了
2. エラーチェックLambda実行
3. DynamoDBクエリ（エラーレコード検索）
4. エラーなし確認
5. 成功通知送信（Slack）
6. 処理完了
```

### 5.2 エラー発生時の処理フロー
```
1. Step Functions分散マップ処理完了（一部エラー含む）
2. エラーチェックLambda実行
3. DynamoDBクエリでエラーレコード発見
4. エラー分析・集計
5. 通知メッセージ作成
6. 複数チャネルに通知送信（SNS、Slack、Email）
7. CloudWatchメトリクス記録
8. アラーム発動（閾値超過時）
9. 運用チームによる対応開始
```

## 6. 実装時の考慮事項

### 6.1 パフォーマンス
- DynamoDBクエリの効率化（適切なGSI設計）
- 大量エラー時の通知制限（spam防止）
- 並列処理での通知重複防止

### 6.2 セキュリティ
- Slack Webhook URLの暗号化保存
- IAM権限の最小化
- 通知内容の機密情報除去

### 6.3 運用性
- 通知の重要度レベル設定
- エスカレーション自動化
- 夜間・休日の通知制御

## 7. まとめ

**実現可能性: ✅ 完全に実現可能**

提案されたアーキテクチャは以下の利点があります：

1. **確実性**: Step Functions完了後に必ずエラーチェックが実行される
2. **柔軟性**: 通知方法や条件を柔軟にカスタマイズ可能
3. **スケーラビリティ**: 大量のエラーレコードにも対応
4. **運用性**: 包括的な監視とアラート機能

この設計により、CSV処理のエラー監視と通知が効果的に実現できます。