# CSV並列処理システム - メインTerraform設定
# Phase 1: 基盤構築

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  backend "s3" {
    bucket         = "naka-enginner-tfstate"
    key            = "05_csv-batch/dev/terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}

# AWS Provider設定
provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      Repository  = "csv-parallel-processing-system"
    }
  }
}

# データソース
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ローカル変数
locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name
  
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Repository  = "csv-parallel-processing-system"
  }
  
  # S3バケット名（統合バケット）
  s3_bucket_name = "csv-processing-${local.account_id}"
}