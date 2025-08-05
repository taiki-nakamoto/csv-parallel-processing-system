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

output "bucket_regional_domain_name" {
  description = "S3 bucket regional domain name"
  value       = aws_s3_bucket.processing.bucket_regional_domain_name
}

# ディレクトリ構造情報
output "directory_structure" {
  description = "S3 bucket directory structure"
  value = {
    input = {
      incoming   = "input/incoming/"
      processing = "input/processing/"
      processed  = "input/processed/"
      failed     = "input/failed/"
    }
    output = {
      results = "output/results/"
      reports = "output/reports/"
      errors  = "output/errors/"
    }
  }
}

# メトリクス設定情報
output "metrics_configurations" {
  description = "CloudWatch metrics configuration names"
  value = [
    "EntireBucket",
    "IncomingFiles", 
    "ProcessingFiles"
  ]
}

# ライフサイクルルール情報
output "lifecycle_rules" {
  description = "S3 lifecycle rules configuration"
  value = {
    unified_lifecycle = {
      standard_ia_days = var.standard_ia_transition_days
      expiration_days  = var.retention_days
    }
    failed_files = {
      expiration_days = 30
    }
    processed_files = {
      expiration_days = 7
    }
  }
}