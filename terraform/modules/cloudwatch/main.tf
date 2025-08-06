# CloudWatchモジュール - ログ設定のみ（個人開発用）
# 参照: 03-12_詳細設計書_監視・ログ詳細設計.md
# 注意: 個人開発のため、アラート・通知・ダッシュボード・X-Rayは実装しない

# Lambdaログ設定
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/csv-processor-${var.environment}"
  retention_in_days = var.log_retention_days
  
  tags = merge(var.tags, {
    Purpose = "Lambda function logs"
    Service = "csv-processor"
  })
}

# Step Functionsログ設定
resource "aws_cloudwatch_log_group" "stepfunctions_logs" {
  name              = "/aws/stepfunctions/csv-processing-${var.environment}"
  retention_in_days = var.log_retention_days
  
  tags = merge(var.tags, {
    Purpose = "Step Functions logs"
    Service = "csv-processing-workflow"
  })
}

# アプリケーションログ設定
resource "aws_cloudwatch_log_group" "application_logs" {
  name              = "/csv-processing/application-${var.environment}"
  retention_in_days = var.log_retention_days
  
  tags = merge(var.tags, {
    Purpose = "Application business logic logs"
    Service = "csv-processing"
  })
}

# システムログ設定（デバッグ用）
resource "aws_cloudwatch_log_group" "system_logs" {
  name              = "/csv-processing/system-${var.environment}"
  retention_in_days = var.log_retention_days
  
  tags = merge(var.tags, {
    Purpose = "System debug and troubleshooting logs"
    Service = "csv-processing"
  })
}