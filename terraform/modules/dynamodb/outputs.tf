# DynamoDBモジュール - 出力定義

output "batch_jobs_table_name" {
  description = "Batch jobs table name"
  value       = aws_dynamodb_table.batch_jobs.name
}

output "batch_jobs_table_arn" {
  description = "Batch jobs table ARN"
  value       = aws_dynamodb_table.batch_jobs.arn
}

output "job_locks_table_name" {
  description = "Job locks table name"
  value       = aws_dynamodb_table.job_locks.name
}

output "job_locks_table_arn" {
  description = "Job locks table ARN"
  value       = aws_dynamodb_table.job_locks.arn
}