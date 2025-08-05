# S3モジュール - 変数定義

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "retention_days" {
  description = "S3 object retention days"
  type        = number
  default     = 30
}

variable "standard_ia_transition_days" {
  description = "Days to transition objects to Standard-IA"
  type        = number
  default     = 7
}

variable "lambda_trigger_arn" {
  description = "Lambda function ARN for S3 event triggers"
  type        = string
  default     = ""
}

variable "lambda_permission_resource" {
  description = "Lambda permission resource for S3 dependency"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}