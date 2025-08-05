# DynamoDBâ¸åüëú›$š©

output "audit_table_name" {
  description = "DynamoDB audit logs table name"
  value       = aws_dynamodb_table.audit_logs.name
}

output "audit_table_arn" {
  description = "DynamoDB audit logs table ARN"
  value       = aws_dynamodb_table.audit_logs.arn
}

output "audit_table_id" {
  description = "DynamoDB audit logs table ID"
  value       = aws_dynamodb_table.audit_logs.id
}

output "audit_table_stream_arn" {
  description = "DynamoDB audit logs table stream ARN"
  value       = aws_dynamodb_table.audit_logs.stream_arn
}

# Global Secondary Index information
output "file_name_index_name" {
  description = "FileNameIndex GSI name"
  value       = "FileNameIndex"
}

output "status_index_name" {
  description = "StatusIndex GSI name"
  value       = "StatusIndex"
}

# Table configuration
output "billing_mode" {
  description = "DynamoDB billing mode"
  value       = aws_dynamodb_table.audit_logs.billing_mode
}

output "ttl_attribute" {
  description = "TTL attribute name"
  value       = aws_dynamodb_table.audit_logs.ttl[0].attribute_name
}

output "ttl_enabled" {
  description = "TTL enabled status"
  value       = aws_dynamodb_table.audit_logs.ttl[0].enabled
}