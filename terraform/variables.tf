# CSV並列処理システム - 変数定義

# 基本設定
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-1"
}

variable "environment" {
  description = "Environment name (dev, prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "csv-parallel-processing"
}

# ネットワーク設定
variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.1.0/24"
}

variable "public_subnet_cidr" {
  description = "Public subnet CIDR block"
  type        = string
  default     = "10.0.1.0/27"
}

variable "private_subnet_cidr" {
  description = "Private subnet CIDR block"
  type        = string
  default     = "10.0.1.32/27"
}

# Lambda設定
variable "lambda_runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs22.x"
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 300
}

variable "lambda_memory_size" {
  description = "Lambda function memory size in MB"
  type        = number
  default     = 512
}

# Step Functions設定
variable "step_functions_log_level" {
  description = "Step Functions log level"
  type        = string
  default     = "ALL"
}

# DynamoDB設定
variable "dynamodb_billing_mode" {
  description = "DynamoDB billing mode"
  type        = string
  default     = "PAY_PER_REQUEST"
}

# Aurora設定
variable "aurora_engine_version" {
  description = "Aurora PostgreSQL engine version"
  type        = string
  default     = "17.5"
}

variable "aurora_instance_class" {
  description = "Aurora instance class"
  type        = string
  default     = "db.serverless"
}

# S3設定
variable "s3_lifecycle_retention_days" {
  description = "S3 object retention days"
  type        = number
  default     = 30
}

variable "s3_standard_ia_transition_days" {
  description = "Days to transition to Standard IA"
  type        = number
  default     = 7
}

# 監視設定
variable "cloudwatch_log_retention_days" {
  description = "CloudWatch Logs retention in days"
  type        = number
  default     = 30
}

# タグ設定
variable "additional_tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}