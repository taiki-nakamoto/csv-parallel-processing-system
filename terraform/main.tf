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

# EventBridgeモジュール（設計書準拠：02-03_EventBridgeルール基本設計）
module "eventbridge" {
  source = "./modules/eventbridge"
  
  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
  
  # S3バケット名（EventBridge監視対象）
  s3_bucket_name = module.s3.bucket_name
  
  # Step Functions ARN（自動起動対象、SAMで作成された実際のARN使用）
  step_functions_arn = "arn:aws:states:${var.aws_region}:${local.account_id}:stateMachine:${var.project_name}-csv-processing-${var.environment}"
  
  # EventBridge実行ロール
  eventbridge_execution_role_arn = module.iam.eventbridge_execution_role_arn
  
  tags = local.common_tags
  
  depends_on = [
    module.s3,
    module.iam
  ]
}
# CloudFormation Stack for Exports (SAM Integration)
resource "aws_cloudformation_stack" "exports" {
  name = "${var.project_name}-terraform-exports-${var.environment}"
  
  template_body = jsonencode({
    AWSTemplateFormatVersion = "2010-09-09"
    Description = "Terraform値のCloudFormation Export（SAM連携用）"
    
    Resources = {
      DummyResource = {
        Type = "AWS::CloudFormation::WaitConditionHandle"
      }
    }
    
    Outputs = {
      # VPC関連
      LambdaSG = {
        Description = "Lambda Security Group ID"
        Value = module.network.lambda_security_group_id
        Export = {
          Name = "${var.project_name}-lambda-sg-${var.environment}"
        }
      }
      PrivateSubnet = {
        Description = "Private Subnet ID"
        Value = module.network.private_subnet_id
        Export = {
          Name = "${var.project_name}-private-subnet-${var.environment}"
        }
      }
      PrivateSubnet2 = {
        Description = "Private Subnet 2 ID"
        Value = module.network.private_subnet_2_id
        Export = {
          Name = "${var.project_name}-private-subnet-2-${var.environment}"
        }
      }
      
      # S3関連
      S3Bucket = {
        Description = "S3 Bucket Name"
        Value = module.s3.bucket_name
        Export = {
          Name = "${var.project_name}-s3-bucket-${var.environment}"
        }
      }
      
      # DynamoDB関連
      AuditTable = {
        Description = "Audit Logs Table Name"
        Value = module.dynamodb.audit_logs_table_name
        Export = {
          Name = "${var.project_name}-audit-logs-${var.environment}"
        }
      }
      ProcessingMetadataTable = {
        Description = "Processing Metadata Table Name"
        Value = module.dynamodb.processing_metadata_table_name
        Export = {
          Name = "${var.project_name}-processing-metadata-${var.environment}"
        }
      }
      BatchJobsTable = {
        Description = "Batch Jobs Table Name"
        Value = module.dynamodb.batch_jobs_table_name
        Export = {
          Name = "${var.project_name}-batch-jobs-${var.environment}"
        }
      }
      JobLocksTable = {
        Description = "Job Locks Table Name"
        Value = module.dynamodb.job_locks_table_name
        Export = {
          Name = "${var.project_name}-job-locks-${var.environment}"
        }
      }
      
      # Aurora関連  
      AuroraEndpoint = {
        Description = "Aurora Cluster Endpoint"
        Value = module.aurora.cluster_endpoint
        Export = {
          Name = "${var.project_name}-aurora-endpoint-${var.environment}"
        }
      }
      AuroraSecret = {
        Description = "Aurora Secret ARN"
        Value = "arn:aws:secretsmanager:ap-northeast-1:526636471122:secret:rds!cluster-9473744a-7f41-4d4e-88d7-427a8d09eadd-hOXGZz"
        Export = {
          Name = "${var.project_name}-aurora-secret-${var.environment}"
        }
      }
      
      # IAM関連
      LambdaRole = {
        Description = "Lambda Execution Role ARN"
        Value = module.iam.lambda_processor_role_arn
        Export = {
          Name = "${var.project_name}-lambda-role-arn-${var.environment}"
        }
      }
      StepFunctionsRole = {
        Description = "Step Functions Execution Role ARN"
        Value = module.iam.step_functions_execution_role_arn
        Export = {
          Name = "${var.project_name}-stepfunctions-role-arn-${var.environment}"
        }
      }
    }
  })
  
  tags = merge(local.common_tags, {
    Name = "Terraform-Exports"
    Type = "Integration"
  })
}
