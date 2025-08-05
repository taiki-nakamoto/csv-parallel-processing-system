# CloudWatchモジュール - ログ・メトリクス定義
# 参照: 03-12_設計書_CloudWatch監視設定.md

# Lambdaログ設定
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/csv-processor-${var.environment}"
  retention_in_days = var.log_retention_days
  
  tags = var.tags
}

# Step Functionsログ設定
resource "aws_cloudwatch_log_group" "stepfunctions_logs" {
  name              = "/aws/stepfunctions/csv-processing-${var.environment}"
  retention_in_days = var.log_retention_days
  
  tags = var.tags
}

# SNSアラート通知設定
resource "aws_sns_topic" "alerts" {
  name = "csv-batch-alerts-${var.environment}"
  
  tags = var.tags
}

# SNSトピックポリシー
resource "aws_sns_topic_policy" "alerts_policy" {
  arn = aws_sns_topic.alerts.arn
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudWatchAlarms"
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.alerts.arn
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

# Lambda用エラーアラーム
resource "aws_cloudwatch_metric_alarm" "lambda_error_rate" {
  alarm_name          = "csv-lambda-error-rate-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "This metric monitors lambda error rate"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    FunctionName = "csv-processor-${var.environment}"
  }
  
  tags = var.tags
}

# Lambda用実行時間アラーム
resource "aws_cloudwatch_metric_alarm" "lambda_duration" {
  alarm_name          = "csv-lambda-duration-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Average"
  threshold           = "240000" # 4分
  alarm_description   = "This metric monitors lambda execution duration"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    FunctionName = "csv-processor-${var.environment}"
  }
  
  tags = var.tags
}

# Step Functions実行失敗アラーム
resource "aws_cloudwatch_metric_alarm" "stepfunctions_failed" {
  alarm_name          = "csv-stepfunctions-failed-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "ExecutionsFailed"
  namespace           = "AWS/States"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "This metric monitors Step Functions execution failures"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    StateMachineArn = "arn:aws:states:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:stateMachine:csv-parallel-processing-workflow-${var.environment}"
  }
  
  tags = var.tags
}

# DynamoDBスロットリングアラーム
resource "aws_cloudwatch_metric_alarm" "dynamodb_throttling" {
  alarm_name          = "csv-dynamodb-throttling-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ThrottledRequests"
  namespace           = "AWS/DynamoDB"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "This metric monitors DynamoDB throttling"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    TableName = "csv-audit-logs-${var.environment}"
  }
  
  tags = var.tags
}

# CloudWatchダッシュボード
resource "aws_cloudwatch_dashboard" "csv_processing_dashboard" {
  dashboard_name = "CSV-Processing-${var.environment}"
  
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", "csv-processor-${var.environment}"],
            [".", "Errors", ".", "."],
            [".", "Duration", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = data.aws_region.current.name
          title   = "Lambda Function Metrics"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/States", "ExecutionsStarted", "StateMachineArn", "arn:aws:states:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:stateMachine:csv-parallel-processing-workflow-${var.environment}"],
            [".", "ExecutionsSucceeded", ".", "."],
            [".", "ExecutionsFailed", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = data.aws_region.current.name
          title   = "Step Functions Execution Metrics"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", "csv-audit-logs-${var.environment}"],
            [".", "ConsumedWriteCapacityUnits", ".", "."],
            [".", "ThrottledRequests", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = data.aws_region.current.name
          title   = "DynamoDB Metrics"
          period  = 300
        }
      }
    ]
  })
  
  tags = var.tags
}

# X-Rayサンプリング設定
resource "aws_xray_sampling_rule" "csv_batch_sampling" {
  rule_name      = "csv-batch-sampling"
  priority       = 9000
  version        = 1
  reservoir_size = 1
  fixed_rate     = 0.1
  url_path       = "*"
  host           = "*"
  http_method    = "*"
  service_type   = "*"
  service_name   = "csv-batch-*"
  resource_arn   = "*"
  
  tags = var.tags
}

# データソース
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}