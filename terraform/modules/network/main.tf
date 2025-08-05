# ネットワークモジュール - VPC、サブネット、セキュリティグループ
# 参照: 03-11_詳細設計書_セキュリティ詳細設計.md

# VPC作成
resource "aws_vpc" "csv_batch_vpc" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = merge(var.tags, {
    Name = "csv-batch-vpc-${var.environment}"
  })
}

# インターネットゲートウェイ作成
resource "aws_internet_gateway" "csv_batch_igw" {
  vpc_id = aws_vpc.csv_batch_vpc.id
  
  tags = merge(var.tags, {
    Name = "csv-batch-igw-${var.environment}"
  })
}

# パブリックサブネット作成（NAT Gateway用）
resource "aws_subnet" "public_subnet" {
  vpc_id                  = aws_vpc.csv_batch_vpc.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true
  
  tags = merge(var.tags, {
    Name = "csv-batch-public-subnet-${var.environment}"
    Type = "Public"
    AZ   = "1a"
  })
}

# プライベートサブネット1作成（AZ-1a: Lambda, Aurora Primary）
resource "aws_subnet" "private_subnet" {
  vpc_id            = aws_vpc.csv_batch_vpc.id
  cidr_block        = var.private_subnet_cidr
  availability_zone = "${var.aws_region}a"
  
  tags = merge(var.tags, {
    Name = "csv-batch-private-subnet-1a-${var.environment}"
    Type = "Private"
    AZ   = "1a"
  })
}

# プライベートサブネット2作成（AZ-1c: Aurora Replica）
resource "aws_subnet" "private_subnet_2" {
  vpc_id            = aws_vpc.csv_batch_vpc.id
  cidr_block        = var.private_subnet_2_cidr
  availability_zone = "${var.aws_region}c"
  
  tags = merge(var.tags, {
    Name = "csv-batch-private-subnet-1c-${var.environment}"
    Type = "Private"
    AZ   = "1c"
  })
}


# Elastic IP for NAT Gateway
resource "aws_eip" "nat_eip" {
  domain = "vpc"
  
  tags = merge(var.tags, {
    Name = "csv-batch-nat-eip-${var.environment}"
  })
  
  depends_on = [aws_internet_gateway.csv_batch_igw]
}

# NATゲートウェイ作成
resource "aws_nat_gateway" "csv_batch_nat" {
  allocation_id = aws_eip.nat_eip.id
  subnet_id     = aws_subnet.public_subnet.id
  
  tags = merge(var.tags, {
    Name = "csv-batch-nat-${var.environment}"
  })
  
  depends_on = [aws_internet_gateway.csv_batch_igw]
}

# パブリックルートテーブル
resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.csv_batch_vpc.id
  
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.csv_batch_igw.id
  }
  
  tags = merge(var.tags, {
    Name = "csv-batch-public-rt-${var.environment}"
  })
}

# プライベートルートテーブル
resource "aws_route_table" "private_rt" {
  vpc_id = aws_vpc.csv_batch_vpc.id
  
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.csv_batch_nat.id
  }
  
  tags = merge(var.tags, {
    Name = "csv-batch-private-rt-${var.environment}"
  })
}

# ルートテーブルとサブネットの関連付け
resource "aws_route_table_association" "public_rta" {
  subnet_id      = aws_subnet.public_subnet.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_route_table_association" "private_rta" {
  subnet_id      = aws_subnet.private_subnet.id
  route_table_id = aws_route_table.private_rt.id
}

resource "aws_route_table_association" "private_rta_2" {
  subnet_id      = aws_subnet.private_subnet_2.id
  route_table_id = aws_route_table.private_rt.id
}


# Lambda用セキュリティグループ（詳細設計書準拠）
resource "aws_security_group" "lambda_sg" {
  name        = "csv-lambda-sg-${var.environment}"
  description = "Security group for Lambda functions"
  vpc_id      = aws_vpc.csv_batch_vpc.id
  
  # Aurora PostgreSQLへのアクセス許可（5432）
  egress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [
      var.private_subnet_cidr, 
      var.private_subnet_2_cidr
    ]
  }
  
  # HTTPSアウトバウンド（AWS APIアクセス用）
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  # HTTPアウトバウンド（パッケージダウンロード等）
  egress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = merge(var.tags, {
    Name = "csv-lambda-sg-${var.environment}"
  })
}

# Aurora用セキュリティグループ（詳細設計書準拠）
resource "aws_security_group" "aurora_sg" {
  name        = "csv-aurora-sg-${var.environment}"
  description = "Security group for Aurora PostgreSQL cluster"
  vpc_id      = aws_vpc.csv_batch_vpc.id
  
  # Lambdaからのアクセス許可
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_sg.id]
  }
  
  tags = merge(var.tags, {
    Name = "csv-aurora-sg-${var.environment}"
  })
}

# VPCエンドポイント用セキュリティグループ
resource "aws_security_group" "vpc_endpoint_sg" {
  name        = "csv-vpce-sg-${var.environment}"
  description = "Security group for VPC Endpoints"
  vpc_id      = aws_vpc.csv_batch_vpc.id
  
  # Lambdaからのアクセス許可
  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_sg.id]
  }
  
  tags = merge(var.tags, {
    Name = "csv-vpce-sg-${var.environment}"
  })
}

# VPCエンドポイント - S3 Gateway Endpoint
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.csv_batch_vpc.id
  service_name = "com.amazonaws.${var.aws_region}.s3"
  
  route_table_ids = [aws_route_table.private_rt.id]
  
  tags = merge(var.tags, {
    Name = "csv-s3-vpce-${var.environment}"
  })
}

# VPCエンドポイント - DynamoDB Gateway Endpoint
resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id       = aws_vpc.csv_batch_vpc.id
  service_name = "com.amazonaws.${var.aws_region}.dynamodb"
  
  route_table_ids = [aws_route_table.private_rt.id]
  
  tags = merge(var.tags, {
    Name = "csv-dynamodb-vpce-${var.environment}"
  })
}