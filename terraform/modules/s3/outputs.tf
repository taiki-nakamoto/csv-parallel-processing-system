# S3â¸åüëú›$š©

output "bucket_name" {
  description = "S3 bucket name"
  value       = aws_s3_bucket.processing.id
}

output "bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.processing.arn
}

output "bucket_domain_name" {
  description = "S3 bucket domain name"
  value       = aws_s3_bucket.processing.bucket_domain_name
}

output "bucket_regional_domain_name" {
  description = "S3 bucket regional domain name"
  value       = aws_s3_bucket.processing.bucket_regional_domain_name
}

output "bucket_versioning_status" {
  description = "S3 bucket versioning status"
  value       = aws_s3_bucket_versioning.processing_versioning.versioning_configuration[0].status
}

# Ç£ì¯ÈêË Å1
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