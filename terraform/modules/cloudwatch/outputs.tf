# CloudWatchモジュール - 出力定義（個人開発用）
# 参照: 03-12_詳細設計書_監視・ログ詳細設計.md
# 注意: 個人開発のため、ロググループ情報のみ出力

# Lambdaロググループ
output "lambda_log_group_name" {
  description = "Lambda log group name"
  value       = aws_cloudwatch_log_group.lambda_logs.name
}

output "lambda_log_group_arn" {
  description = "Lambda log group ARN"
  value       = aws_cloudwatch_log_group.lambda_logs.arn
}

# Step Functionsロググループ
output "step_functions_log_group_name" {
  description = "Step Functions log group name"
  value       = aws_cloudwatch_log_group.stepfunctions_logs.name
}

output "step_functions_log_group_arn" {
  description = "Step Functions log group ARN"
  value       = aws_cloudwatch_log_group.stepfunctions_logs.arn
}

# アプリケーションロググループ
output "application_log_group_name" {
  description = "Application log group name"
  value       = aws_cloudwatch_log_group.application_logs.name
}

output "application_log_group_arn" {
  description = "Application log group ARN"
  value       = aws_cloudwatch_log_group.application_logs.arn
}

# システムロググループ
output "system_log_group_name" {
  description = "System log group name"
  value       = aws_cloudwatch_log_group.system_logs.name
}

output "system_log_group_arn" {
  description = "System log group ARN"
  value       = aws_cloudwatch_log_group.system_logs.arn
}

# 全ロググループ情報
output "log_groups" {
  description = "All log groups created by this module"
  value = {
    lambda      = aws_cloudwatch_log_group.lambda_logs.name
    stepfunctions = aws_cloudwatch_log_group.stepfunctions_logs.name
    application = aws_cloudwatch_log_group.application_logs.name
    system      = aws_cloudwatch_log_group.system_logs.name
  }
}