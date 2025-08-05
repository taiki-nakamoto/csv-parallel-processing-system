# Step Functions分散マップのエラーハンドリング詳細

Step Functions分散マップでは、大規模な並列処理において堅牢なエラーハンドリングが不可欠です。本ドキュメントでは、分散マップにおけるエラーハンドリングの仕組み、設定方法、ベストプラクティスについて詳しく解説します。

## 1. Step Functions分散マップでのエラーハンドリング概要

### 1.1 エラーハンドリングのレベル

Step Functions分散マップでは、以下の3つのレベルでエラーハンドリングが可能です：

1. **親ワークフローレベル**: 分散マップ全体の失敗処理
2. **子ワークフローレベル**: 個々のアイテム処理の失敗処理
3. **ステートレベル**: 個別のステートでの失敗処理

### 1.2 エラーの種類

#### 1.2.1 システムエラー
- **States.Runtime**: 実行時エラー
- **States.Timeout**: タイムアウトエラー
- **States.TaskFailed**: タスク失敗エラー
- **States.Permissions**: 権限エラー

#### 1.2.2 Lambda固有のエラー
- **Lambda.ServiceException**: Lambda サービス例外
- **Lambda.AWSLambdaException**: Lambda AWS例外
- **Lambda.SdkClientException**: SDK クライアント例外
- **Lambda.TooManyRequestsException**: 同時実行制限エラー

#### 1.2.3 カスタムエラー
- **ビジネスロジックエラー**: Lambda関数内で発生するアプリケーション固有のエラー
- **データ検証エラー**: 入力データの妥当性チェックエラー

## 2. 分散マップでのエラーハンドリング設定

### 2.1 基本的なRetry設定

```json
{
  "Type": "Map",
  "Mode": "DISTRIBUTED",
  "ItemProcessor": {
    "ProcessorConfig": {
      "Mode": "DISTRIBUTED",
      "ExecutionType": "STANDARD"
    },
    "StartAt": "ProcessItem",
    "States": {
      "ProcessItem": {
        "Type": "Task",
        "Resource": "arn:aws:states:::lambda:invoke",
        "Parameters": {
          "FunctionName": "arn:aws:lambda:region:account:function:process-item",
          "Payload.$": "$"
        },
        "Retry": [
          {
            "ErrorEquals": ["Lambda.ServiceException", "Lambda.AWSLambdaException"],
            "IntervalSeconds": 2,
            "MaxAttempts": 3,
            "BackoffRate": 2.0
          },
          {
            "ErrorEquals": ["Lambda.TooManyRequestsException"],
            "IntervalSeconds": 5,
            "MaxAttempts": 5,
            "BackoffRate": 2.0
          },
          {
            "ErrorEquals": ["States.TaskFailed"],
            "IntervalSeconds": 1,
            "MaxAttempts": 2,
            "BackoffRate": 1.5
          }
        ],
        "End": true
      }
    }
  }
}
```

### 2.2 高度なCatch設定

```json
{
  "Type": "Map",
  "Mode": "DISTRIBUTED",
  "ItemProcessor": {
    "ProcessorConfig": {
      "Mode": "DISTRIBUTED",
      "ExecutionType": "STANDARD"
    },
    "StartAt": "ProcessItem",
    "States": {
      "ProcessItem": {
        "Type": "Task",
        "Resource": "arn:aws:states:::lambda:invoke",
        "Parameters": {
          "FunctionName": "arn:aws:lambda:region:account:function:process-item",
          "Payload.$": "$"
        },
        "Retry": [
          {
            "ErrorEquals": ["Lambda.ServiceException"],
            "IntervalSeconds": 2,
            "MaxAttempts": 3,
            "BackoffRate": 2.0
          }
        ],
        "Catch": [
          {
            "ErrorEquals": ["DataValidationError"],
            "Next": "HandleValidationError",
            "ResultPath": "$.error"
          },
          {
            "ErrorEquals": ["BusinessLogicError"],
            "Next": "HandleBusinessError",
            "ResultPath": "$.error"
          },
          {
            "ErrorEquals": ["States.ALL"],
            "Next": "HandleGenericError",
            "ResultPath": "$.error"
          }
        ],
        "End": true
      },
      "HandleValidationError": {
        "Type": "Task",
        "Resource": "arn:aws:states:::lambda:invoke",
        "Parameters": {
          "FunctionName": "arn:aws:lambda:region:account:function:handle-validation-error",
          "Payload.$": "$"
        },
        "End": true
      },
      "HandleBusinessError": {
        "Type": "Task",
        "Resource": "arn:aws:states:::lambda:invoke",
        "Parameters": {
          "FunctionName": "arn:aws:lambda:region:account:function:handle-business-error",
          "Payload.$": "$"
        },
        "End": true
      },
      "HandleGenericError": {
        "Type": "Task",
        "Resource": "arn:aws:states:::lambda:invoke",
        "Parameters": {
          "FunctionName": "arn:aws:lambda:region:account:function:handle-generic-error",
          "Payload.$": "$"
        },
        "End": true
      }
    }
  },
  "ToleratedFailurePercentage": 5,
  "ToleratedFailureCount": 10
}
```

### 2.3 分散マップレベルでのエラー制御

#### 2.3.1 ToleratedFailurePercentage
```json
{
  "Type": "Map",
  "Mode": "DISTRIBUTED",
  "ToleratedFailurePercentage": 5,
  "ItemProcessor": {
    // プロセッサ定義
  }
}
```
- 全体の5%まで失敗を許容
- これを超えると分散マップ全体が失敗

#### 2.3.2 ToleratedFailureCount
```json
{
  "Type": "Map",
  "Mode": "DISTRIBUTED",
  "ToleratedFailureCount": 100,
  "ItemProcessor": {
    // プロセッサ定義
  }
}
```
- 100個まで失敗を許容
- これを超えると分散マップ全体が失敗

## 3. エラーハンドリングのベストプラクティス

### 3.1 階層的エラーハンドリング

#### 3.1.1 Lambda関数内でのエラーハンドリング
```python
import json
import logging
from enum import Enum

logger = logging.getLogger()
logger.setLevel(logging.INFO)

class ErrorType(Enum):
    DATA_VALIDATION = "DataValidationError"
    BUSINESS_LOGIC = "BusinessLogicError"
    EXTERNAL_SERVICE = "ExternalServiceError"
    SYSTEM_ERROR = "SystemError"

def lambda_handler(event, context):
    try:
        # 入力データの検証
        if not validate_input(event):
            raise_custom_error(ErrorType.DATA_VALIDATION, "Invalid input data", event)
        
        # ビジネスロジックの実行
        result = process_business_logic(event)
        
        return {
            'statusCode': 200,
            'body': result,
            'metadata': {
                'processedAt': context.aws_request_id,
                'item': event.get('item_id', 'unknown')
            }
        }
        
    except ValueError as e:
        raise_custom_error(ErrorType.DATA_VALIDATION, str(e), event)
    except BusinessException as e:
        raise_custom_error(ErrorType.BUSINESS_LOGIC, str(e), event)
    except ExternalServiceException as e:
        raise_custom_error(ErrorType.EXTERNAL_SERVICE, str(e), event)
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise_custom_error(ErrorType.SYSTEM_ERROR, str(e), event)

def raise_custom_error(error_type: ErrorType, message: str, context: dict):
    error_detail = {
        'error_type': error_type.value,
        'message': message,
        'context': context,
        'timestamp': datetime.utcnow().isoformat()
    }
    logger.error(f"Custom error raised: {error_detail}")
    raise Exception(json.dumps(error_detail))

def validate_input(event):
    required_fields = ['item_id', 'data']
    return all(field in event for field in required_fields)

def process_business_logic(event):
    # ビジネスロジックの実装
    pass
```

#### 3.1.2 エラー処理用Lambda関数
```python
import json
import boto3
import logging
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
sqs = boto3.client('sqs')

def lambda_handler(event, context):
    """
    エラー処理専用のLambda関数
    """
    try:
        error_info = extract_error_info(event)
        
        # エラーをDynamoDBに記録
        record_error_to_dynamodb(error_info)
        
        # 重要なエラーの場合はSQSにメッセージを送信
        if error_info['severity'] == 'HIGH':
            send_to_dlq(error_info)
        
        # 再処理可能なエラーの場合は再処理キューに送信
        if error_info['retryable']:
            schedule_retry(error_info)
        
        return {
            'statusCode': 200,
            'errorHandled': True,
            'errorId': error_info['error_id']
        }
        
    except Exception as e:
        logger.error(f"Error in error handler: {str(e)}", exc_info=True)
        raise

def extract_error_info(event):
    """イベントからエラー情報を抽出"""
    error_data = event.get('error', {})
    
    if isinstance(error_data.get('Cause'), str):
        try:
            cause = json.loads(error_data['Cause'])
            error_message = cause.get('errorMessage', 'Unknown error')
        except json.JSONDecodeError:
            error_message = error_data.get('Cause', 'Unknown error')
    else:
        error_message = str(error_data)
    
    return {
        'error_id': generate_error_id(),
        'timestamp': datetime.utcnow().isoformat(),
        'error_message': error_message,
        'error_type': classify_error(error_message),
        'severity': determine_severity(error_message),
        'retryable': is_retryable_error(error_message),
        'original_input': event.get('original_input', {}),
        'execution_arn': event.get('execution_arn', '')
    }

def record_error_to_dynamodb(error_info):
    """エラー情報をDynamoDBに記録"""
    table = dynamodb.Table('error-log-table')
    table.put_item(Item=error_info)

def send_to_dlq(error_info):
    """重要なエラーをDLQに送信"""
    sqs.send_message(
        QueueUrl='https://sqs.region.amazonaws.com/account/error-dlq',
        MessageBody=json.dumps(error_info)
    )

def schedule_retry(error_info):
    """再処理をスケジュール"""
    sqs.send_message(
        QueueUrl='https://sqs.region.amazonaws.com/account/retry-queue',
        MessageBody=json.dumps(error_info),
        DelaySeconds=300  # 5分後に再処理
    )
```

### 3.2 エラーモニタリングとアラート

#### 3.2.1 CloudWatch Metrics
```json
{
  "MetricName": "DistributedMapFailures",
  "Namespace": "StepFunctions/DistributedMap",
  "Dimensions": [
    {
      "Name": "StateMachineArn",
      "Value": "arn:aws:states:region:account:stateMachine:csv-processor"
    }
  ],
  "Value": 1,
  "Unit": "Count"
}
```

#### 3.2.2 CloudWatch Alarm設定
```json
{
  "AlarmName": "HighFailureRate-DistributedMap",
  "MetricName": "ExecutionsFailed",
  "Namespace": "AWS/States",
  "Statistic": "Sum",
  "Period": 300,
  "EvaluationPeriods": 2,
  "Threshold": 10,
  "ComparisonOperator": "GreaterThanThreshold",
  "AlarmActions": [
    "arn:aws:sns:region:account:topic:stepfunctions-alerts"
  ]
}
```

### 3.3 パフォーマンス最適化を考慮したエラーハンドリング

#### 3.3.1 適応的リトライ間隔
```json
{
  "Retry": [
    {
      "ErrorEquals": ["Lambda.TooManyRequestsException"],
      "IntervalSeconds": 2,
      "MaxAttempts": 6,
      "BackoffRate": 2.0,
      "JitterStrategy": "FULL"
    }
  ]
}
```

#### 3.3.2 エラータイプ別の処理戦略
```json
{
  "Catch": [
    {
      "ErrorEquals": ["DataValidationError"],
      "Next": "LogAndContinue",
      "ResultPath": "$.validationError"
    },
    {
      "ErrorEquals": ["TemporaryError"],
      "Next": "RetryLater",
      "ResultPath": "$.temporaryError"
    },
    {
      "ErrorEquals": ["FatalError"],
      "Next": "StopProcessing",
      "ResultPath": "$.fatalError"
    }
  ]
}
```

## 4. エラー分析とレポーティング

### 4.1 エラーダッシュボード

#### 4.1.1 CloudWatch Dashboard設定
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/States", "ExecutionsFailed", "StateMachineArn", "arn:aws:states:region:account:stateMachine:csv-processor"],
          ["AWS/States", "ExecutionsSucceeded", "StateMachineArn", "arn:aws:states:region:account:stateMachine:csv-processor"]
        ],
        "period": 300,
        "stat": "Sum",
        "region": "region",
        "title": "Step Functions Execution Status"
      }
    },
    {
      "type": "log",
      "properties": {
        "query": "SOURCE '/aws/lambda/process-item'\n| fields @timestamp, @message\n| filter @message like /ERROR/\n| sort @timestamp desc\n| limit 20",
        "region": "region",
        "title": "Recent Errors"
      }
    }
  ]
}
```

### 4.2 エラー分析クエリ

#### 4.2.1 エラー頻度分析
```sql
SOURCE '/aws/stepfunctions/statemachine/csv-processor'
| fields @timestamp, @message
| filter @message like /ExecutionFailed/
| stats count() by bin(5m)
```

#### 4.2.2 エラータイプ別分析
```sql
SOURCE '/aws/lambda/process-item'
| fields @timestamp, @message
| filter @message like /Custom error raised/
| parse @message "error_type\": \"(?<error_type>[^\"]*)\""
| stats count() by error_type
| sort count desc
```

## 5. 災害復旧とデータ整合性

### 5.1 部分的失敗からの復旧

#### 5.1.1 失敗したアイテムの特定
```python
import boto3

def get_failed_items(execution_arn):
    """失敗したアイテムを特定する"""
    stepfunctions = boto3.client('stepfunctions')
    
    # 実行履歴を取得
    response = stepfunctions.get_execution_history(
        executionArn=execution_arn,
        maxResults=1000,
        reverseOrder=True
    )
    
    failed_items = []
    for event in response['events']:
        if event['type'] == 'MapIterationFailed':
            failed_items.append({
                'timestamp': event['timestamp'],
                'details': event['mapIterationFailedEventDetails']
            })
    
    return failed_items
```

#### 5.1.2 再処理用データの準備
```python
def prepare_retry_data(failed_items, original_input):
    """再処理用のデータを準備"""
    retry_data = {
        'retry_execution': True,
        'original_execution': original_input.get('execution_arn'),
        'failed_items': failed_items,
        'retry_timestamp': datetime.utcnow().isoformat()
    }
    
    return retry_data
```

### 5.2 データ整合性の確保

#### 5.2.1 冪等性の実装
```python
def process_item_idempotent(event, context):
    """冪等性を保証したアイテム処理"""
    item_id = event['item_id']
    processing_id = event.get('processing_id', generate_processing_id())
    
    # 処理済みかチェック
    if is_already_processed(item_id, processing_id):
        return get_previous_result(item_id, processing_id)
    
    # 処理実行
    result = process_item(event)
    
    # 結果を記録
    record_processing_result(item_id, processing_id, result)
    
    return result
```

## 6. まとめ

### 6.1 エラーハンドリングの重要ポイント

1. **多層防御**: Lambda関数、Step Functionsステート、分散マップの各レベルでエラーハンドリング
2. **適切な分類**: エラータイプに応じた適切な処理戦略の実装
3. **可視性**: 包括的なモニタリングとアラートの設定
4. **復旧性**: 部分的失敗からの効率的な復旧メカニズム
5. **冪等性**: 再処理時のデータ整合性の確保

### 6.2 運用における推奨事項

- **段階的なロールアウト**: 本番環境では小規模なテストから開始
- **定期的な見直し**: エラーパターンに基づく設定の最適化
- **ドキュメント化**: エラー対応手順の明文化
- **チーム教育**: エラーハンドリングのベストプラクティスの共有

適切なエラーハンドリングの実装により、Step Functions分散マップは大規模なデータ処理において高い信頼性と可用性を提供できます。