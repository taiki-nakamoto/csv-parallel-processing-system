# ネットワークモジュール - 出力定義

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.csv_batch_vpc.id
}

output "vpc_cidr_block" {
  description = "VPC CIDR block"
  value       = aws_vpc.csv_batch_vpc.cidr_block
}

output "public_subnet_id" {
  description = "Public subnet ID"
  value       = aws_subnet.public_subnet.id
}

output "private_subnet_id" {
  description = "Private subnet ID"
  value       = aws_subnet.private_subnet.id
}

output "private_subnet_2_id" {
  description = "Private subnet 2 ID"
  value       = aws_subnet.private_subnet_2.id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = [aws_subnet.private_subnet.id, aws_subnet.private_subnet_2.id]
}

output "internet_gateway_id" {
  description = "Internet Gateway ID"
  value       = aws_internet_gateway.csv_batch_igw.id
}

output "nat_gateway_id" {
  description = "NAT Gateway ID"
  value       = aws_nat_gateway.csv_batch_nat.id
}

output "lambda_security_group_id" {
  description = "Lambda security group ID"
  value       = aws_security_group.lambda_sg.id
}

output "aurora_security_group_id" {
  description = "Aurora security group ID"
  value       = aws_security_group.aurora_sg.id
}

output "vpc_endpoint_security_group_id" {
  description = "VPC Endpoint security group ID"
  value       = aws_security_group.vpc_endpoint_sg.id
}

output "public_route_table_id" {
  description = "Public route table ID"
  value       = aws_route_table.public_rt.id
}

output "private_route_table_id" {
  description = "Private route table ID"
  value       = aws_route_table.private_rt.id
}