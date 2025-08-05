# S3モジュール - 出力定義

output "bucket_name" {
  description = "S3 bucket name"
  value       = aws_s3_bucket.processing.bucket
}

output "bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.processing.arn
}

output "bucket_id" {
  description = "S3 bucket ID"
  value       = aws_s3_bucket.processing.id
}

output "bucket_domain_name" {
  description = "S3 bucket domain name"
  value       = aws_s3_bucket.processing.bucket_domain_name
}