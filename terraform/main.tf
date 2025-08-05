# CSV並列処理システム - メインTerraform設定
# Phase 1: 基盤構築

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.31.0"
    }
  }
  
  backend "s3" {
    bucket  = "naka-enginner-tfstate"
    key     = "05_csv-batch/dev/terraform.tfstate"
    region  = "ap-northeast-1"
    encrypt = true
  }
}

# AWS Provider設定
provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "csv-batch"
      Environment = var.environment
      ManagedBy   = "terraform"
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

# ネットワークモジュール
module "network" {
  source = "./modules/network"
  
  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
  
  vpc_cidr              = var.vpc_cidr
  public_subnet_cidr    = var.public_subnet_cidr
  private_subnet_cidr   = var.private_subnet_cidr
  private_subnet_2_cidr = var.private_subnet_2_cidr
  
  tags = local.common_tags
}

# IAMモジュール
module "iam" {
  source = "./modules/iam"
  
  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
  
  tags = local.common_tags
}

# S3モジュール
module "s3" {
  source = "./modules/s3"
  
  project_name = var.project_name
  environment  = var.environment
  
  retention_days             = var.s3_lifecycle_retention_days
  standard_ia_transition_days = var.s3_standard_ia_transition_days
  
  tags = local.common_tags
}

# DynamoDBモジュール
module "dynamodb" {
  source = "./modules/dynamodb"
  
  project_name = var.project_name
  environment  = var.environment
  
  billing_mode = var.dynamodb_billing_mode
  
  tags = local.common_tags
}

# Aurora PostgreSQLモジュール
module "aurora" {
  source = "./modules/aurora"
  
  project_name = var.project_name
  environment  = var.environment
  
  engine_version = var.aurora_engine_version
  database_name  = "csvbatch"
  
  # ネットワーク設定
  security_group_ids = [module.network.aurora_security_group_id]
  subnet_ids = [
    module.network.private_subnet_id,
    module.network.private_subnet_2_id
  ]
  
  # Serverless v2設定
  max_capacity = var.environment == "prod" ? 4.0 : 2.0
  min_capacity = var.environment == "prod" ? 1.0 : 0.5
  
  # バックアップ設定
  backup_retention_period = var.environment == "prod" ? 14 : 7
  
  # ログ設定
  log_retention_days = var.cloudwatch_log_retention_days
  
  tags = local.common_tags
}

# CloudWatchモジュール
module "cloudwatch" {
  source = "./modules/cloudwatch"
  
  project_name = var.project_name
  environment  = var.environment
  
  log_retention_days = var.cloudwatch_log_retention_days
  
  tags = local.common_tags
}