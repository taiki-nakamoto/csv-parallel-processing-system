# Aurora PostgreSQLモジュール - 出力定義

output "cluster_identifier" {
  description = "Aurora cluster identifier"
  value       = aws_rds_cluster.csv_batch_cluster.cluster_identifier
}

output "cluster_endpoint" {
  description = "Aurora cluster endpoint"
  value       = aws_rds_cluster.csv_batch_cluster.endpoint
}

output "cluster_reader_endpoint" {
  description = "Aurora cluster reader endpoint"
  value       = aws_rds_cluster.csv_batch_cluster.reader_endpoint
}

output "cluster_port" {
  description = "Aurora cluster port"
  value       = aws_rds_cluster.csv_batch_cluster.port
}

output "cluster_database_name" {
  description = "Aurora cluster database name"
  value       = aws_rds_cluster.csv_batch_cluster.database_name
}

output "cluster_master_username" {
  description = "Aurora cluster master username"
  value       = aws_rds_cluster.csv_batch_cluster.master_username
  sensitive   = true
}

output "cluster_arn" {
  description = "Aurora cluster ARN"
  value       = aws_rds_cluster.csv_batch_cluster.arn
}

output "cluster_resource_id" {
  description = "Aurora cluster resource ID"
  value       = aws_rds_cluster.csv_batch_cluster.cluster_resource_id
}

output "instance_endpoints" {
  description = "Aurora instance endpoints"
  value       = aws_rds_cluster_instance.csv_batch_instance[*].endpoint
}

output "instance_identifiers" {
  description = "Aurora instance identifiers"
  value       = aws_rds_cluster_instance.csv_batch_instance[*].identifier
}

output "db_subnet_group_name" {
  description = "DB subnet group name"
  value       = aws_db_subnet_group.aurora_subnet_group.name
}

output "parameter_group_name" {
  description = "DB parameter group name"
  value       = aws_db_parameter_group.aurora_pg.name
}

output "cluster_parameter_group_name" {
  description = "DB cluster parameter group name"
  value       = aws_rds_cluster_parameter_group.aurora_cluster_pg.name
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for Aurora logs"
  value       = aws_cloudwatch_log_group.aurora_postgresql.name
}