# CSV並列処理システム - 出力値定義

# 基本情報
output "account_id" {
  description = "AWS Account ID"
  value       = local.account_id
}

output "region" {
  description = "AWS Region"
  value       = local.region
}

output "environment" {
  description = "Environment name"
  value       = var.environment
}

# VPC関連
output "vpc_id" {
  description = "VPC ID"
  value       = module.network.vpc_id
}

output "public_subnet_id" {
  description = "Public subnet ID"
  value       = module.network.public_subnet_id
}

output "private_subnet_id" {
  description = "Private subnet ID"
  value       = module.network.private_subnet_id
}

output "private_subnet_2_id" {
  description = "Private subnet 2 ID"  
  value       = module.network.private_subnet_2_id
}

# セキュリティグループ
output "lambda_security_group_id" {
  description = "Lambda security group ID"
  value       = module.network.lambda_security_group_id
}

output "aurora_security_group_id" {
  description = "Aurora security group ID"
  value       = module.network.aurora_security_group_id
}

# S3関連
output "s3_bucket_name" {
  description = "S3 bucket name for CSV processing"
  value       = module.s3.bucket_name
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN"
  value       = module.s3.bucket_arn
}

# DynamoDB関連
output "dynamodb_audit_table_name" {
  description = "DynamoDB audit logs table name"
  value       = module.dynamodb.audit_logs_table_name
}

output "dynamodb_audit_table_arn" {
  description = "DynamoDB audit logs table ARN"
  value       = module.dynamodb.audit_logs_table_arn
}

# DynamoDB - 他のテーブル
output "dynamodb_processing_metadata_table_name" {
  description = "DynamoDB processing metadata table name"
  value       = module.dynamodb.processing_metadata_table_name
}

output "dynamodb_batch_jobs_table_name" {
  description = "DynamoDB batch jobs table name"
  value       = module.dynamodb.batch_jobs_table_name
}

output "dynamodb_job_locks_table_name" {
  description = "DynamoDB job locks table name"
  value       = module.dynamodb.job_locks_table_name
}

# IAMロール
output "lambda_execution_role_arn" {
  description = "Lambda execution role ARN"
  value       = module.iam.lambda_processor_role_arn
}

output "step_functions_execution_role_arn" {
  description = "Step Functions execution role ARN"
  value       = module.iam.step_functions_execution_role_arn
}

# CloudWatch
output "log_group_step_functions" {
  description = "Step Functions log group name"
  value       = module.cloudwatch.step_functions_log_group_name
}

output "log_group_lambda" {
  description = "Lambda log group name"
  value       = module.cloudwatch.lambda_log_group_name
}

# Aurora関連
output "aurora_cluster_endpoint" {
  description = "Aurora cluster endpoint"
  value       = module.aurora.cluster_endpoint
}

output "aurora_cluster_port" {
  description = "Aurora cluster port"
  value       = module.aurora.cluster_port
}

output "aurora_database_name" {
  description = "Aurora database name"
  value       = module.aurora.cluster_database_name
}

output "aurora_master_username" {
  description = "Aurora master username"
  value       = module.aurora.cluster_master_username
  sensitive   = true
}

output "aurora_cluster_arn" {
  description = "Aurora cluster ARN"
  value       = module.aurora.cluster_arn
}

output "aurora_secret_arn" {
  description = "Aurora master user secret ARN"
  value       = "arn:aws:secretsmanager:ap-northeast-1:526636471122:secret:rds!cluster-9473744a-7f41-4d4e-88d7-427a8d09eadd-hOXGZz"
}

# Step Functions（後で実装）
# output "step_functions_state_machine_arn" {
#   description = "Step Functions state machine ARN"
#   value       = module.stepfunctions.state_machine_arn
#   sensitive   = false
# }

# Lambda関数（後で実装）
# output "lambda_function_arn" {
#   description = "CSV processor Lambda function ARN"
#   value       = module.lambda.function_arn
# }

# EventBridge関連出力
output "eventbridge_rule_arn" {
  description = "EventBridgeルールのARN"
  value       = module.eventbridge.eventbridge_rule_arn
}

output "eventbridge_rule_name" {
  description = "EventBridgeルール名"
  value       = module.eventbridge.eventbridge_rule_name
}

output "eventbridge_execution_role_arn" {
  description = "EventBridge実行ロールのARN"
  value       = module.iam.eventbridge_execution_role_arn
}