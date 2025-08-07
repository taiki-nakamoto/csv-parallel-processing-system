# EventBridgeモジュール出力値

output "eventbridge_rule_arn" {
  description = "EventBridgeルールのARN"
  value       = aws_cloudwatch_event_rule.csv_upload_processor.arn
}

output "eventbridge_rule_name" {
  description = "EventBridgeルール名"
  value       = aws_cloudwatch_event_rule.csv_upload_processor.name
}

output "eventbridge_target_id" {
  description = "EventBridgeターゲットID"
  value       = aws_cloudwatch_event_target.step_functions_target.target_id
}