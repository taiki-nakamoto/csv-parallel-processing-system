# CSV並列処理システム - モジュール定義

# ネットワークモジュール
module "network" {
  source = "./modules/network"
  
  project_name         = var.project_name
  environment          = var.environment
  vpc_cidr            = var.vpc_cidr
  public_subnet_cidr  = var.public_subnet_cidr
  private_subnet_cidr = var.private_subnet_cidr
  
  tags = merge(local.common_tags, var.additional_tags)
}

# IAMモジュール
module "iam" {
  source = "./modules/iam"
  
  project_name    = var.project_name
  environment     = var.environment
  s3_bucket_name  = local.s3_bucket_name
  
  tags = merge(local.common_tags, var.additional_tags)
}

# S3モジュール
module "s3" {
  source = "./modules/s3"
  
  project_name                   = var.project_name
  environment                    = var.environment
  bucket_name                    = local.s3_bucket_name
  lifecycle_retention_days       = var.s3_lifecycle_retention_days
  standard_ia_transition_days    = var.s3_standard_ia_transition_days
  
  tags = merge(local.common_tags, var.additional_tags)
}

# DynamoDBモジュール
module "dynamodb" {
  source = "./modules/dynamodb"
  
  project_name    = var.project_name
  environment     = var.environment
  billing_mode    = var.dynamodb_billing_mode
  
  tags = merge(local.common_tags, var.additional_tags)
}

# CloudWatchモジュール
module "cloudwatch" {
  source = "./modules/cloudwatch"
  
  project_name     = var.project_name
  environment      = var.environment
  log_retention_days = var.cloudwatch_log_retention_days
  
  tags = merge(local.common_tags, var.additional_tags)
}

# Lambdaモジュール
module "lambda" {
  source = "./modules/lambda"
  
  project_name             = var.project_name
  environment              = var.environment
  runtime                  = var.lambda_runtime
  timeout                  = var.lambda_timeout
  memory_size              = var.lambda_memory_size
  
  # 依存関係
  vpc_id                   = module.network.vpc_id
  subnet_ids               = [module.network.private_subnet_id]
  security_group_ids       = [module.network.lambda_security_group_id]
  execution_role_arn       = module.iam.lambda_execution_role_arn
  s3_bucket_name           = module.s3.bucket_name
  dynamodb_table_name      = module.dynamodb.audit_table_name
  cloudwatch_log_group_name = module.cloudwatch.lambda_log_group_name
  
  tags = merge(local.common_tags, var.additional_tags)
}

# Step Functionsモジュール
module "stepfunctions" {
  source = "./modules/stepfunctions"
  
  project_name              = var.project_name
  environment               = var.environment
  log_level                 = var.step_functions_log_level
  
  # 依存関係
  execution_role_arn        = module.iam.step_functions_execution_role_arn
  lambda_function_arn       = module.lambda.function_arn
  s3_bucket_name            = module.s3.bucket_name
  cloudwatch_log_group_arn  = module.cloudwatch.step_functions_log_group_arn
  
  tags = merge(local.common_tags, var.additional_tags)
}