# DynamoDBモジュール - 出力定義

# 監査ログテーブル
output "audit_logs_table_name" {
  description = "Audit logs table name"
  value       = aws_dynamodb_table.audit_logs.name
}

output "audit_logs_table_arn" {
  description = "Audit logs table ARN"
  value       = aws_dynamodb_table.audit_logs.arn
}

output "audit_logs_table_id" {
  description = "Audit logs table ID"
  value       = aws_dynamodb_table.audit_logs.id
}

# 処理メタデータテーブル
output "processing_metadata_table_name" {
  description = "Processing metadata table name"
  value       = aws_dynamodb_table.processing_metadata.name
}

output "processing_metadata_table_arn" {
  description = "Processing metadata table ARN"
  value       = aws_dynamodb_table.processing_metadata.arn
}

output "processing_metadata_table_id" {
  description = "Processing metadata table ID"
  value       = aws_dynamodb_table.processing_metadata.id
}

# バッチジョブ管理テーブル
output "batch_jobs_table_name" {
  description = "Batch jobs table name"
  value       = aws_dynamodb_table.batch_jobs.name
}

output "batch_jobs_table_arn" {
  description = "Batch jobs table ARN"
  value       = aws_dynamodb_table.batch_jobs.arn
}

output "batch_jobs_table_id" {
  description = "Batch jobs table ID"
  value       = aws_dynamodb_table.batch_jobs.id
}

# ジョブロック管理テーブル
output "job_locks_table_name" {
  description = "Job locks table name"
  value       = aws_dynamodb_table.job_locks.name
}

output "job_locks_table_arn" {
  description = "Job locks table ARN"
  value       = aws_dynamodb_table.job_locks.arn
}

output "job_locks_table_id" {
  description = "Job locks table ID"
  value       = aws_dynamodb_table.job_locks.id
}

# Global Secondary Index情報
output "audit_logs_gsi_names" {
  description = "Audit logs GSI names"
  value = [
    "LogLevelIndex",
    "EventTypeIndex"
  ]
}

output "processing_metadata_gsi_names" {
  description = "Processing metadata GSI names"
  value = [
    "ProcessingStageIndex"
  ]
}

output "batch_jobs_gsi_names" {
  description = "Batch jobs GSI names"
  value = [
    "status-created_at-index",
    "file_name-created_at-index"
  ]
}

# テーブル設定情報
output "tables_billing_mode" {
  description = "DynamoDB tables billing mode"
  value       = var.billing_mode
}

output "tables_with_ttl" {
  description = "Tables with TTL enabled"
  value = {
    audit_logs           = "ttl (90 days)"
    processing_metadata  = "ttl (30 days)" 
    batch_jobs          = "ttl (90 days)"
    job_locks           = "expires_at (auto-release)"
  }
}