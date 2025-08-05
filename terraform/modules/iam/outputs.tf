# IAMモジュール - 出力定義

output "lambda_processor_role_arn" {
  description = "Lambda processor role ARN"
  value       = aws_iam_role.lambda_processor_role.arn
}

output "lambda_processor_role_name" {
  description = "Lambda processor role name"
  value       = aws_iam_role.lambda_processor_role.name
}

output "step_functions_execution_role_arn" {
  description = "Step Functions execution role ARN"
  value       = aws_iam_role.step_functions_execution_role.arn
}

output "step_functions_execution_role_name" {
  description = "Step Functions execution role name"
  value       = aws_iam_role.step_functions_execution_role.name
}