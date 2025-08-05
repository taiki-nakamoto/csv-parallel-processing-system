# Õ√»Ô¸Ø‚∏Â¸Î	pö©

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-1"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
}

variable "public_subnet_cidr" {
  description = "Public subnet CIDR block"
  type        = string
}

variable "private_subnet_cidr" {
  description = "Private subnet CIDR block"
  type        = string
}

variable "private_subnet_2_cidr" {
  description = "Private subnet 2 CIDR block for Aurora (multi-AZ)"
  type        = string
  default     = "10.0.1.64/27"
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}