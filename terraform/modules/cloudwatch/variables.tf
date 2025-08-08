# CloudWatchモジュール - 変数定義（個人開発用）
# 参照: 03-12_詳細設計書_監視・ログ詳細設計.md
# 注意: 個人開発のため、ログ保存期間のみ設定可能

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention in days"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}