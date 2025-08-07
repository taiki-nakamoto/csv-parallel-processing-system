# EventBridgeモジュール変数定義

variable "project_name" {
  description = "プロジェクト名"
  type        = string
  default     = "csv-parallel-processing"
}

variable "environment" {
  description = "環境名 (dev, staging, prod)"
  type        = string
}

variable "aws_region" {
  description = "AWSリージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "s3_bucket_name" {
  description = "EventBridge監視対象のS3バケット名"
  type        = string
}

variable "step_functions_arn" {
  description = "起動対象のStep FunctionsステートマシンARN"
  type        = string
}

variable "eventbridge_execution_role_arn" {
  description = "EventBridgeがStep Functionsを実行するためのIAMロールARN"
  type        = string
}

variable "tags" {
  description = "リソースに適用するタグ"
  type        = map(string)
  default     = {}
}