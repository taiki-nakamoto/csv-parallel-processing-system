# Step Functions詳細設計書

## 1. 概要

### 1.1 目的
本ドキュメントでは、CSVファイル並列処理システムにおけるStep Functionsステートマシンの詳細実装仕様を定義する。基本設計書に基づき、具体的な実装レベルの設計を記載する。

### 1.2 対象範囲
- ステートマシン定義の詳細仕様
- 分散マップの詳細設定
- エラー処理フローの実装仕様
- 再試行設定の詳細パラメータ
- 実行時パラメータの詳細仕様

## 2. ステートマシン定義詳細

### 2.1 ステートマシン実装仕様

#### 2.1.1 CloudFormationリソース定義
```yaml
CSVProcessingStateMachine:
  Type: AWS::StepFunctions::StateMachine
  Properties:
    StateMachineName: csv-main-workflow
    StateMachineType: STANDARD
    RoleArn: !GetAtt StepFunctionsExecutionRole.Arn
    DefinitionString: !Sub |
      ${StateMachineDefinition}
    LoggingConfiguration:
      Level: ALL
      IncludeExecutionData: true
      Destinations:
        - CloudWatchLogsLogGroup:
            LogGroupArn: !GetAtt StepFunctionsLogGroup.Arn
    TracingConfiguration:
      Enabled: true
    Tags:
      - Key: Project
        Value: CSV-Parallel-Processing
      - Key: Environment
        Value: !Ref Environment
      - Key: CostCenter
        Value: !Ref CostCenter
```

#### 2.1.2 実行名生成Lambda関数
```python
import json
import re
from datetime import datetime
import hashlib

def lambda_handler(event, context):
    """
    EventBridgeイベントから一意な実行名を生成
    """
    try:
        # S3イベント情報の取得
        s3_bucket = event['detail']['bucket']['name']
        s3_key = event['detail']['object']['key']
        s3_etag = event['detail']['object'].get('etag', '')
        
        # 実行名の生成
        execution_name = generate_execution_name(s3_key, s3_etag)
        
        # Step Functions実行パラメータの構築
        execution_input = {
            "detail": event['detail'],
            "metadata": {
                "triggerTime": event['time'],
                "eventId": event['id'],
                "region": event['region'],
                "account": event['account']
            }
        }
        
        return {
            "executionName": execution_name,
            "input": json.dumps(execution_input)
        }
        
    except Exception as e:
        raise Exception(f"Failed to generate execution parameters: {str(e)}")

def generate_execution_name(s3_key, s3_etag):
    """
    S3キーとETagから一意な実行名を生成（80文字制限）
    """
    # ファイル名部分の抽出
    filename = s3_key.split('/')[-1]
    base_name = filename.rsplit('.', 1)[0]
    
    # 特殊文字の正規化
    sanitized = re.sub(r'[^a-zA-Z0-9_-]', '-', base_name)
    sanitized = re.sub(r'-+', '-', sanitized)
    sanitized = sanitized.strip('-')
    
    # ETagからハッシュ値生成（一意性確保）
    if s3_etag:
        etag_hash = hashlib.md5(s3_etag.encode()).hexdigest()[:8]
    else:
        etag_hash = datetime.now().strftime("%H%M%S%f")[:8]
    
    # 70文字制限（ハッシュ用に10文字確保）
    if len(sanitized) > 70:
        sanitized = sanitized[:70]
    
    execution_name = f"{sanitized}-{etag_hash}"
    
    return execution_name[:80]
```

### 2.2 各ステート実装詳細

#### 2.2.1 InitializeExecutionステート
```json
{
  "InitializeExecution": {
    "Type": "Pass",
    "Comment": "実行開始時の初期化処理とパラメータ検証",
    "Parameters": {
      "execution": {
        "id.$": "$$.Execution.Name",
        "startTime.$": "$$.Execution.StartTime",
        "stateMachineArn.$": "$$.StateMachine.Id",
        "input.$": "$"
      },
      "s3": {
        "bucket.$": "$.detail.bucket.name",
        "key.$": "$.detail.object.key",
        "size.$": "$.detail.object.size",
        "etag.$": "$.detail.object.etag",
        "versionId.$": "$.detail.object.versionId"
      },
      "processing": {
        "maxConcurrency": 5,
        "toleratedFailurePercentage": 5,
        "chunkSize": 200,
        "maxRetries": 3
      },
      "timestamp.$": "$$.State.EnteredTime"
    },
    "ResultPath": "$",
    "OutputPath": "$",
    "Next": "ValidateCSVFile"
  }
}
```

#### 2.2.2 ValidateCSVFileステート詳細
```json
{
  "ValidateCSVFile": {
    "Type": "Task",
    "Comment": "CSVファイル形式検証と前処理",
    "Resource": "arn:aws:lambda:ap-northeast-1:${AWS::AccountId}:function:csv-processor",
    "Parameters": {
      "bucket.$": "$.s3.bucket",
      "key.$": "$.s3.key",
      "executionId.$": "$.execution.id",
      "validationRules": {
        "maxFileSize": 104857600,
        "allowedEncodings": ["UTF-8", "SHIFT-JIS"],
        "requiredColumns": ["ユーザーID", "ログイン回数", "投稿回数"],
        "columnTypes": {
          "ユーザーID": "string",
          "ログイン回数": "integer",
          "投稿回数": "integer"
        }
      }
    },
    "ResultPath": "$.validation",
    "TimeoutSeconds": 300,
    "HeartbeatSeconds": 30,
    "Retry": [
      {
        "ErrorEquals": ["Lambda.ServiceException", "Lambda.AWSLambdaException"],
        "IntervalSeconds": 2,
        "MaxAttempts": 3,
        "BackoffRate": 2.0,
        "MaxDelaySeconds": 60
      },
      {
        "ErrorEquals": ["Lambda.TooManyRequestsException"],
        "IntervalSeconds": 5,
        "MaxAttempts": 5,
        "BackoffRate": 2.5,
        "MaxDelaySeconds": 120
      },
      {
        "ErrorEquals": ["States.TaskFailed"],
        "IntervalSeconds": 1,
        "MaxAttempts": 2,
        "BackoffRate": 1.5,
        "MaxDelaySeconds": 10
      }
    ],
    "Catch": [
      {
        "ErrorEquals": ["ValidationError", "InvalidCSVFormatError"],
        "Next": "ValidationFailure",
        "ResultPath": "$.error"
      },
      {
        "ErrorEquals": ["FileTooLargeError"],
        "Next": "ValidationFailure",
        "ResultPath": "$.error"
      },
      {
        "ErrorEquals": ["States.ALL"],
        "Next": "SystemFailure",
        "ResultPath": "$.error"
      }
    ],
    "Next": "CheckValidationResult"
  }
}
```

## 3. 分散マップ詳細設定

### 3.1 ProcessUserDataParallelステート詳細
```json
{
  "ProcessUserDataParallel": {
    "Type": "Map",
    "Comment": "ユーザーログデータの分散並列処理",
    "ItemProcessor": {
      "ProcessorConfig": {
        "Mode": "DISTRIBUTED",
        "ExecutionType": "STANDARD"
      },
      "StartAt": "ProcessSingleUserRecord",
      "States": {
        "ProcessSingleUserRecord": {
          "Type": "Task",
          "Resource": "arn:aws:lambda:ap-northeast-1:${AWS::AccountId}:function:csv-chunk-processor",
          "Parameters": {
            "userRecord.$": "$",
            "executionContext": {
              "executionId.$": "$$.Execution.Name",
              "mapRunId.$": "$$.Map.Item.Context.Execution.Name",
              "itemIndex.$": "$$.Map.Item.Index",
              "totalItems.$": "$$.Map.Item.Context.Map.Item.Count"
            },
            "processingConfig": {
              "retryOnConflict": true,
              "conflictResolutionStrategy": "LATEST_WINS",
              "auditLogEnabled": true
            }
          },
          "ResultPath": "$.processResult",
          "TimeoutSeconds": 30,
          "HeartbeatSeconds": 10,
          "Retry": [
            {
              "ErrorEquals": ["DatabaseConnectionError", "AuroraTemporaryError"],
              "IntervalSeconds": 2,
              "MaxAttempts": 3,
              "BackoffRate": 2.0,
              "MaxDelaySeconds": 30,
              "JitterStrategy": "FULL"
            },
            {
              "ErrorEquals": ["ConcurrentModificationException"],
              "IntervalSeconds": 1,
              "MaxAttempts": 5,
              "BackoffRate": 1.5,
              "MaxDelaySeconds": 15,
              "JitterStrategy": "FULL"
            },
            {
              "ErrorEquals": ["Lambda.ThrottledException"],
              "IntervalSeconds": 3,
              "MaxAttempts": 4,
              "BackoffRate": 2.5,
              "MaxDelaySeconds": 60
            }
          ],
          "Catch": [
            {
              "ErrorEquals": ["BusinessLogicError", "DataValidationError"],
              "Next": "RecordProcessingError",
              "ResultPath": "$.error"
            },
            {
              "ErrorEquals": ["States.ALL"],
              "Next": "RecordSystemError",
              "ResultPath": "$.error"
            }
          ],
          "Next": "RecordSuccess"
        }
      }
    },
    "ItemsPath": "$.validation.csvRows",
    "ItemBatcher": {
      "MaxBatchSize": 25,
      "BatchInput": {
        "executionId.$": "$.execution.id",
        "batchMetadata": {
          "timestamp.$": "$$.State.EnteredTime"
        }
      }
    },
    "MaxConcurrency": 5,
    "ToleratedFailurePercentage": 5,
    "ToleratedFailureCount": 50,
    "ResultWriter": {
      "Resource": "arn:aws:states:::s3:putObject",
      "Parameters": {
        "Bucket": "csv-processing-results",
        "Prefix": "map-results/"
      }
    },
    "ResultPath": "$.mapResults",
    "ResultSelector": {
      "statistics": {
        "total.$": "$$.Map.Item.Count",
        "succeeded.$": "$$.Map.Item.Stats.Succeeded",
        "failed.$": "$$.Map.Item.Stats.Failed",
        "timedOut.$": "$$.Map.Item.Stats.TimedOut",
        "aborted.$": "$$.Map.Item.Stats.Aborted"
      },
      "resultLocation": {
        "bucket": "csv-processing-results",
        "prefix": "map-results/"
      }
    },
    "Next": "AggregateResults",
    "Catch": [
      {
        "ErrorEquals": ["States.MapRunFailed"],
        "Next": "MapProcessingFailure",
        "ResultPath": "$.error"
      }
    ]
  }
}
```

### 3.2 分散マップ実行設定詳細

#### 3.2.1 ItemBatcher設定
```json
{
  "ItemBatcher": {
    "MaxBatchSize": 25,
    "MaxInputBytesPerBatch": 262144,
    "BatchInput": {
      "batchId.$": "$$.Map.Item.BatchId",
      "batchSize.$": "$$.Map.Item.BatchSize",
      "executionContext": {
        "executionId.$": "$.execution.id",
        "timestamp.$": "$$.State.EnteredTime"
      }
    }
  }
}
```

#### 3.2.2 ResultWriter設定
```json
{
  "ResultWriter": {
    "Resource": "arn:aws:states:::s3:putObject",
    "Parameters": {
      "Bucket": "${ResultBucket}",
      "Prefix.$": "States.Format('results/{}/map-output/', $.execution.id)"
    },
    "ResultPath": "$.resultWriterOutput"
  }
}
```

## 4. エラー処理フロー詳細

### 4.1 エラー分類と処理詳細

#### 4.1.1 ValidationFailureステート
```json
{
  "ValidationFailure": {
    "Type": "Task",
    "Comment": "CSV検証失敗時の詳細エラー処理",
    "Resource": "arn:aws:lambda:ap-northeast-1:${AWS::AccountId}:function:csv-processor",
    "Parameters": {
      "errorType": "VALIDATION_FAILURE",
      "errorDetails": {
        "errorCode.$": "$.error.Cause.errorCode",
        "errorMessage.$": "$.error.Cause.errorMessage",
        "validationErrors.$": "$.error.Cause.validationErrors"
      },
      "executionContext": {
        "executionId.$": "$.execution.id",
        "stateName.$": "$$.State.Name",
        "stateEnteredTime.$": "$$.State.EnteredTime"
      },
      "s3Object": {
        "bucket.$": "$.s3.bucket",
        "key.$": "$.s3.key",
        "size.$": "$.s3.size"
      },
      "notificationConfig": {
        "snsTopicArn": "${ErrorNotificationTopic}",
        "emailSubject": "CSV Validation Failed",
        "includeErrorDetails": true
      }
    },
    "ResultPath": "$.errorHandling",
    "TimeoutSeconds": 60,
    "Retry": [
      {
        "ErrorEquals": ["Lambda.ServiceException"],
        "IntervalSeconds": 2,
        "MaxAttempts": 2,
        "BackoffRate": 2.0
      }
    ],
    "Next": "RecordFailureAudit"
  }
}
```

#### 4.1.2 MapProcessingFailureステート
```json
{
  "MapProcessingFailure": {
    "Type": "Task",
    "Comment": "分散マップ処理失敗時の集約エラー処理",
    "Resource": "arn:aws:lambda:ap-northeast-1:${AWS::AccountId}:function:csv-processor",
    "Parameters": {
      "errorType": "MAP_PROCESSING_FAILURE",
      "errorDetails": {
        "mapStatistics.$": "$.mapResults.statistics",
        "failureReason.$": "$.error.Cause",
        "failedItemIndices.$": "$.error.Cause.FailedEntries"
      },
      "executionContext": {
        "executionId.$": "$.execution.id",
        "processedCount.$": "$.mapResults.statistics.succeeded",
        "failedCount.$": "$.mapResults.statistics.failed"
      },
      "recoveryOptions": {
        "createRetryFile": true,
        "retryBucket": "${RetryBucket}",
        "notifyOperations": true
      }
    },
    "ResultPath": "$.errorHandling",
    "TimeoutSeconds": 120,
    "Next": "GenerateFailureReport"
  }
}
```

#### 4.1.3 SystemFailureステート
```json
{
  "SystemFailure": {
    "Type": "Task",
    "Comment": "システム障害時の包括的エラー処理",
    "Resource": "arn:aws:lambda:ap-northeast-1:${AWS::AccountId}:function:csv-processor",
    "Parameters": {
      "errorType": "SYSTEM_FAILURE",
      "errorDetails": {
        "error.$": "$.error",
        "lastState.$": "$$.State.Name",
        "executionArn.$": "$$.Execution.Id"
      },
      "escalation": {
        "createIncident": true,
        "severity": "HIGH",
        "runbookUrl": "https://wiki.internal/csv-processing-runbook"
      },
      "diagnostics": {
        "captureExecutionHistory": true,
        "captureLambdaLogs": true,
        "timeRange": 300
      }
    },
    "ResultPath": "$.errorHandling",
    "TimeoutSeconds": 180,
    "Next": "NotifyOperations"
  }
}
```

### 4.2 エラー通知フロー

#### 4.2.1 NotifyOperationsステート
```json
{
  "NotifyOperations": {
    "Type": "Task",
    "Resource": "arn:aws:states:::sns:publish",
    "Parameters": {
      "TopicArn": "${OperationsNotificationTopic}",
      "Subject.$": "States.Format('CSV Processing Failed - {}', $.execution.id)",
      "Message.$": "States.JsonToString($)",
      "MessageAttributes": {
        "severity": {
          "DataType": "String",
          "StringValue": "HIGH"
        },
        "executionId": {
          "DataType": "String",
          "StringValue.$": "$.execution.id"
        },
        "errorType": {
          "DataType": "String",
          "StringValue.$": "$.errorHandling.errorType"
        }
      }
    },
    "Next": "FailureComplete"
  }
}
```

## 5. 再試行設定詳細

### 5.1 Lambda関数再試行設定

#### 5.1.1 再試行パターン定義
```python
RETRY_PATTERNS = {
    "transient_errors": {
        "error_types": [
            "Lambda.ServiceException",
            "Lambda.AWSLambdaException",
            "Lambda.SdkClientException"
        ],
        "config": {
            "IntervalSeconds": 2,
            "MaxAttempts": 3,
            "BackoffRate": 2.0,
            "MaxDelaySeconds": 60
        }
    },
    "throttling_errors": {
        "error_types": [
            "Lambda.TooManyRequestsException",
            "Lambda.ThrottledException",
            "States.ThrottledException"
        ],
        "config": {
            "IntervalSeconds": 5,
            "MaxAttempts": 5,
            "BackoffRate": 2.5,
            "MaxDelaySeconds": 120,
            "JitterStrategy": "FULL"
        }
    },
    "database_errors": {
        "error_types": [
            "DatabaseConnectionError",
            "AuroraTemporaryError",
            "DeadlockException"
        ],
        "config": {
            "IntervalSeconds": 2,
            "MaxAttempts": 3,
            "BackoffRate": 2.0,
            "MaxDelaySeconds": 30,
            "JitterStrategy": "FULL"
        }
    },
    "concurrency_errors": {
        "error_types": [
            "ConcurrentModificationException",
            "OptimisticLockException"
        ],
        "config": {
            "IntervalSeconds": 1,
            "MaxAttempts": 5,
            "BackoffRate": 1.5,
            "MaxDelaySeconds": 15,
            "JitterStrategy": "FULL"
        }
    }
}
```

### 5.2 再試行メトリクス収集

#### 5.2.1 再試行監視Lambda
```python
import json
import boto3
from datetime import datetime

cloudwatch = boto3.client('cloudwatch')

def record_retry_metrics(context, retry_info):
    """
    再試行メトリクスをCloudWatchに記録
    """
    metrics = []
    
    # 再試行回数メトリクス
    metrics.append({
        'MetricName': 'RetryAttempts',
        'Value': retry_info['attempt_number'],
        'Unit': 'Count',
        'Dimensions': [
            {'Name': 'StateMachine', 'Value': context['state_machine_name']},
            {'Name': 'State', 'Value': retry_info['state_name']},
            {'Name': 'ErrorType', 'Value': retry_info['error_type']}
        ],
        'Timestamp': datetime.utcnow()
    })
    
    # 再試行遅延メトリクス
    metrics.append({
        'MetricName': 'RetryDelay',
        'Value': retry_info['delay_seconds'],
        'Unit': 'Seconds',
        'Dimensions': [
            {'Name': 'StateMachine', 'Value': context['state_machine_name']},
            {'Name': 'State', 'Value': retry_info['state_name']}
        ],
        'Timestamp': datetime.utcnow()
    })
    
    # CloudWatchにメトリクス送信
    cloudwatch.put_metric_data(
        Namespace='CSVProcessing/StepFunctions',
        MetricData=metrics
    )
```

## 6. 監視・アラート詳細設定

### 6.1 CloudWatch Alarms設定

#### 6.1.1 実行失敗アラーム
```yaml
ExecutionFailureAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: !Sub ${AWS::StackName}-execution-failures
    AlarmDescription: Step Functions execution failures
    MetricName: ExecutionsFailed
    Namespace: AWS/States
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 1
    Threshold: 1
    ComparisonOperator: GreaterThanOrEqualToThreshold
    Dimensions:
      - Name: StateMachineArn
        Value: !Ref CSVProcessingStateMachine
    AlarmActions:
      - !Ref OperationsNotificationTopic
    TreatMissingData: notBreaching
```

#### 6.1.2 実行時間超過アラーム
```yaml
ExecutionDurationAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: !Sub ${AWS::StackName}-execution-duration
    AlarmDescription: Execution duration exceeds threshold
    MetricName: ExecutionTime
    Namespace: AWS/States
    Statistic: Average
    Period: 300
    EvaluationPeriods: 2
    Threshold: 300000  # 5分
    ComparisonOperator: GreaterThanThreshold
    Dimensions:
      - Name: StateMachineArn
        Value: !Ref CSVProcessingStateMachine
    AlarmActions:
      - !Ref OperationsNotificationTopic
```

### 6.2 カスタムメトリクス詳細

#### 6.2.1 ビジネスメトリクス定義
```python
BUSINESS_METRICS = {
    "csv_processing": {
        "namespace": "CSVProcessing/Business",
        "metrics": [
            {
                "name": "RecordsProcessed",
                "unit": "Count",
                "dimensions": ["FileType", "ProcessingResult"]
            },
            {
                "name": "ProcessingDuration",
                "unit": "Milliseconds",
                "dimensions": ["FileSize", "RecordCount"]
            },
            {
                "name": "ValidationErrors",
                "unit": "Count",
                "dimensions": ["ErrorType", "FileName"]
            },
            {
                "name": "DatabaseUpdates",
                "unit": "Count",
                "dimensions": ["TableName", "OperationType"]
            }
        ]
    }
}
```

## 7. パフォーマンス最適化設定

### 7.1 Lambda関数の予約同時実行数

```yaml
UserLogProcessorConcurrency:
  Type: AWS::Lambda::ProvisionedConcurrencyConfig
  Properties:
    FunctionName: !Ref UserLogProcessor
    ProvisionedConcurrentExecutions: 10
    Qualifier: !GetAtt UserLogProcessorVersion.Version

CSVValidatorConcurrency:
  Type: AWS::Lambda::ReservedConcurrentExecutions
  Properties:
    FunctionName: !Ref CSVValidator
    ReservedConcurrentExecutions: 5
```

### 7.2 S3読み取り最適化

```python
def optimized_s3_read(bucket, key, range_start=None, range_end=None):
    """
    S3からの効率的なデータ読み取り
    """
    s3 = boto3.client('s3', 
        config=Config(
            max_pool_connections=50,
            s3={'addressing_style': 'virtual'}
        )
    )
    
    params = {
        'Bucket': bucket,
        'Key': key
    }
    
    # 範囲指定読み取り
    if range_start is not None and range_end is not None:
        params['Range'] = f'bytes={range_start}-{range_end}'
    
    # リトライ設定
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = s3.get_object(**params)
            return response['Body'].read()
        except ClientError as e:
            if attempt == max_retries - 1:
                raise
            time.sleep(2 ** attempt)
```

## 8. デプロイメント設定

### 8.1 CloudFormationパラメータ

```yaml
Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, stg, prod]
    Default: dev
    
  MaxConcurrency:
    Type: Number
    Default: 5
    MinValue: 1
    MaxValue: 100
    
  ToleratedFailurePercentage:
    Type: Number
    Default: 5
    MinValue: 0
    MaxValue: 100
    
  LambdaMemorySize:
    Type: Number
    Default: 1024
    AllowedValues: [512, 1024, 2048, 3072]
    
  EnableXRayTracing:
    Type: String
    AllowedValues: [true, false]
    Default: true
```

### 8.2 環境別設定

```yaml
Mappings:
  EnvironmentConfig:
    dev:
      LogRetentionDays: 7
      AlarmEvaluationPeriods: 1
      DynamoDBCapacity: 5
    stg:
      LogRetentionDays: 14
      AlarmEvaluationPeriods: 2
      DynamoDBCapacity: 10
    prod:
      LogRetentionDays: 30
      AlarmEvaluationPeriods: 3
      DynamoDBCapacity: 25
```

## 9. セキュリティ設定詳細

### 9.1 Step Functions実行ロール詳細

```yaml
StepFunctionsExecutionRole:
  Type: AWS::IAM::Role
  Properties:
    RoleName: !Sub ${AWS::StackName}-stepfunctions-execution-role
    AssumeRolePolicyDocument:
      Version: '2012-10-17'
      Statement:
        - Effect: Allow
          Principal:
            Service: states.amazonaws.com
          Action: sts:AssumeRole
    ManagedPolicyArns:
      - arn:aws:iam::aws:policy/CloudWatchLogsFullAccess
      - arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess
    Policies:
      - PolicyName: LambdaInvokePolicy
        PolicyDocument:
          Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action:
                - lambda:InvokeFunction
              Resource:
                - !GetAtt CSVValidator.Arn
                - !GetAtt UserLogProcessor.Arn
                - !GetAtt AuditLogger.Arn
                - !GetAtt ResultAggregator.Arn
                - !GetAtt ErrorHandler.Arn
              Condition:
                StringEquals:
                  aws:RequestedRegion: !Ref AWS::Region
      - PolicyName: S3AccessPolicy
        PolicyDocument:
          Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action:
                - s3:GetObject
                - s3:PutObject
              Resource:
                - !Sub ${InputBucket.Arn}/*
                - !Sub ${ResultBucket.Arn}/*
              Condition:
                StringEquals:
                  s3:x-amz-server-side-encryption: AES256
```

### 9.2 Lambda関数実行ロール

```yaml
LambdaExecutionRole:
  Type: AWS::IAM::Role
  Properties:
    RoleName: !Sub ${AWS::StackName}-lambda-execution-role
    AssumeRolePolicyDocument:
      Version: '2012-10-17'
      Statement:
        - Effect: Allow
          Principal:
            Service: lambda.amazonaws.com
          Action: sts:AssumeRole
    ManagedPolicyArns:
      - arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole
      - arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess
    Policies:
      - PolicyName: DatabaseAccessPolicy
        PolicyDocument:
          Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action:
                - rds:DescribeDBInstances
                - rds:DescribeDBClusters
              Resource: '*'
            - Effect: Allow
              Action:
                - rds-data:ExecuteStatement
                - rds-data:BatchExecuteStatement
              Resource: !Sub arn:aws:rds-db:${AWS::Region}:${AWS::AccountId}:cluster:${AuroraCluster}
      - PolicyName: DynamoDBAccessPolicy
        PolicyDocument:
          Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action:
                - dynamodb:PutItem
                - dynamodb:GetItem
                - dynamodb:Query
                - dynamodb:UpdateItem
              Resource:
                - !GetAtt AuditLogTable.Arn
                - !Sub ${AuditLogTable.Arn}/index/*
```

## 10. テスト仕様

### 10.1 単体テストケース

```python
import pytest
import json
from moto import mock_stepfunctions

@mock_stepfunctions
class TestStateMachine:
    """
    ステートマシン単体テスト
    """
    
    def test_validation_success_flow(self):
        """正常系：CSV検証成功フロー"""
        input_data = {
            "detail": {
                "bucket": {"name": "test-bucket"},
                "object": {
                    "key": "test/valid.csv",
                    "size": 1024,
                    "etag": "abc123"
                }
            }
        }
        
        # ステートマシン実行
        execution = start_execution(
            state_machine_arn=STATE_MACHINE_ARN,
            input=json.dumps(input_data)
        )
        
        # 結果検証
        assert execution['status'] == 'SUCCEEDED'
        assert 'validation' in execution['output']
        assert execution['output']['validation']['isValid'] == True
    
    def test_validation_failure_flow(self):
        """異常系：CSV検証失敗フロー"""
        input_data = {
            "detail": {
                "bucket": {"name": "test-bucket"},
                "object": {
                    "key": "test/invalid.csv",
                    "size": 1024,
                    "etag": "xyz789"
                }
            }
        }
        
        execution = start_execution(
            state_machine_arn=STATE_MACHINE_ARN,
            input=json.dumps(input_data)
        )
        
        assert execution['status'] == 'FAILED'
        assert execution['output']['status'] == 'VALIDATION_FAILURE'
    
    def test_distributed_map_partial_failure(self):
        """分散マップ部分失敗テスト"""
        # 1000件中50件失敗（5%以内）のテストケース
        pass
    
    def test_retry_behavior(self):
        """再試行動作テスト"""
        # Lambda一時エラーの再試行テスト
        pass
```

### 10.2 統合テストシナリオ

```bash
#!/bin/bash
# 統合テスト実行スクリプト

# テスト環境設定
export AWS_REGION=ap-northeast-1
export STACK_NAME=csv-processing-test
export TEST_BUCKET=csv-processing-test-bucket

# テストケース1: 小規模CSV処理
echo "Test Case 1: Small CSV Processing"
aws s3 cp test-data/small-100-rows.csv s3://${TEST_BUCKET}/input/
sleep 10
check_execution_status "small-100-rows"

# テストケース2: 中規模CSV処理
echo "Test Case 2: Medium CSV Processing"
aws s3 cp test-data/medium-1000-rows.csv s3://${TEST_BUCKET}/input/
sleep 30
check_execution_status "medium-1000-rows"

# テストケース3: エラーケース
echo "Test Case 3: Error Case"
aws s3 cp test-data/invalid-format.csv s3://${TEST_BUCKET}/input/
sleep 10
check_execution_status "invalid-format" "FAILED"

# テストケース4: 並行実行
echo "Test Case 4: Concurrent Executions"
for i in {1..5}; do
    aws s3 cp test-data/concurrent-${i}.csv s3://${TEST_BUCKET}/input/ &
done
wait
sleep 60
check_concurrent_executions
```

## 11. 運用手順

### 11.1 デプロイ手順

```bash
# 1. パラメータファイル準備
cat > parameters-prod.json <<EOF
[
  {"ParameterKey": "Environment", "ParameterValue": "prod"},
  {"ParameterKey": "MaxConcurrency", "ParameterValue": "5"},
  {"ParameterKey": "ToleratedFailurePercentage", "ParameterValue": "5"},
  {"ParameterKey": "LambdaMemorySize", "ParameterValue": "1024"},
  {"ParameterKey": "EnableXRayTracing", "ParameterValue": "true"}
]
EOF

# 2. CloudFormationスタック作成
aws cloudformation create-stack \
  --stack-name csv-processing-prod \
  --template-body file://csv-processing-stack.yaml \
  --parameters file://parameters-prod.json \
  --capabilities CAPABILITY_NAMED_IAM \
  --tags Key=Project,Value=CSVProcessing Key=Environment,Value=prod

# 3. スタック作成完了待機
aws cloudformation wait stack-create-complete \
  --stack-name csv-processing-prod

# 4. 出力値取得
aws cloudformation describe-stacks \
  --stack-name csv-processing-prod \
  --query 'Stacks[0].Outputs'
```

### 11.2 監視ダッシュボード設定

```json
{
  "DashboardName": "CSV-Processing-Monitor",
  "DashboardBody": {
    "widgets": [
      {
        "type": "metric",
        "properties": {
          "metrics": [
            ["AWS/States", "ExecutionsSucceeded", {"stat": "Sum"}],
            [".", "ExecutionsFailed", {"stat": "Sum"}],
            [".", "ExecutionsTimedOut", {"stat": "Sum"}]
          ],
          "period": 300,
          "stat": "Sum",
          "region": "ap-northeast-1",
          "title": "Execution Status"
        }
      },
      {
        "type": "metric",
        "properties": {
          "metrics": [
            ["AWS/States", "ExecutionTime", {"stat": "Average"}],
            ["...", {"stat": "Maximum"}],
            ["...", {"stat": "Minimum"}]
          ],
          "period": 300,
          "region": "ap-northeast-1",
          "title": "Execution Duration"
        }
      }
    ]
  }
}
```

## 12. トラブルシューティング

### 12.1 よくある問題と対処法

| 問題 | 症状 | 対処法 |
|------|------|--------|
| 実行名重複エラー | ExecutionAlreadyExists | ETag/タイムスタンプを使用した一意性確保 |
| Lambda同時実行制限 | TooManyRequestsException | 予約同時実行数の調整 |
| DynamoDB書き込みスロットリング | ProvisionedThroughputExceededException | オンデマンドモードへの変更 |
| メモリ不足エラー | Lambda function out of memory | メモリサイズの増加（最大3GB） |
| タイムアウトエラー | Task timed out | タイムアウト値の調整、処理の最適化 |

### 12.2 デバッグ手順

```python
def debug_execution(execution_arn):
    """
    実行履歴からデバッグ情報を取得
    """
    client = boto3.client('stepfunctions')
    
    # 実行履歴取得
    history = client.get_execution_history(
        executionArn=execution_arn,
        maxResults=100,
        reverseOrder=True
    )
    
    # エラーイベントの抽出
    error_events = [
        event for event in history['events']
        if event['type'] in ['TaskFailed', 'ExecutionFailed']
    ]
    
    # 詳細情報の表示
    for event in error_events:
        print(f"Error at {event['timestamp']}")
        print(f"State: {event.get('stateEnteredEventDetails', {}).get('name')}")
        print(f"Error: {event.get('taskFailedEventDetails', {}).get('error')}")
        print(f"Cause: {event.get('taskFailedEventDetails', {}).get('cause')}")
```

このStep Functions詳細設計書により、CSVファイル並列処理システムの実装レベルでの詳細が明確になり、開発チームが具体的な実装を進めることができます。