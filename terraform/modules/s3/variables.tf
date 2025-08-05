# S3â¸åüë	pš©

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "bucket_name" {
  description = "S3 bucket name"
  type        = string
}

variable "lifecycle_retention_days" {
  description = "Days to retain objects before deletion"
  type        = number
  default     = 30
}

variable "standard_ia_transition_days" {
  description = "Days before transitioning to Standard IA"
  type        = number
  default     = 7
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}