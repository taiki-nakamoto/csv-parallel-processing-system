# IAMâ¸åüëú›$š©

output "lambda_execution_role_arn" {
  description = "Lambda execution role ARN"
  value       = aws_iam_role.lambda_execution_role.arn
}

output "lambda_execution_role_name" {
  description = "Lambda execution role name"
  value       = aws_iam_role.lambda_execution_role.name
}

output "step_functions_execution_role_arn" {
  description = "Step Functions execution role ARN"
  value       = aws_iam_role.stepfunctions_execution_role.arn
}

output "step_functions_execution_role_name" {
  description = "Step Functions execution role name"
  value       = aws_iam_role.stepfunctions_execution_role.name
}

# Ýê·üARN
output "lambda_vpc_policy_arn" {
  description = "Lambda VPC policy ARN"
  value       = aws_iam_policy.lambda_vpc_policy.arn
}

output "lambda_s3_policy_arn" {
  description = "Lambda S3 policy ARN"
  value       = aws_iam_policy.lambda_s3_policy.arn
}

output "lambda_dynamodb_policy_arn" {
  description = "Lambda DynamoDB policy ARN"
  value       = aws_iam_policy.lambda_dynamodb_policy.arn
}

output "lambda_rds_policy_arn" {
  description = "Lambda RDS policy ARN"
  value       = aws_iam_policy.lambda_rds_policy.arn
}

output "stepfunctions_distributed_map_policy_arn" {
  description = "Step Functions distributed map policy ARN"
  value       = aws_iam_policy.stepfunctions_distributed_map_policy.arn
}