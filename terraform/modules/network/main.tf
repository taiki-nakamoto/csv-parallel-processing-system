# ÍÃÈïü¯â¸åüë - VPCµÖÍÃÈ»­åêÆ£°ëü×
# Âg: 03-01_s0-ø_¤óÕés0-.md

# VPC\
resource "aws_vpc" "csv_batch_vpc" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = merge(var.tags, {
    Name = "csv-batch-vpc-${var.environment}"
  })
}

# ¤ó¿üÍÃÈ²üÈ¦§¤\
resource "aws_internet_gateway" "csv_batch_igw" {
  vpc_id = aws_vpc.csv_batch_vpc.id
  
  tags = merge(var.tags, {
    Name = "csv-batch-igw-${var.environment}"
  })
}

# ÑÖêÃ¯µÖÍÃÈ\
resource "aws_subnet" "public_subnet" {
  vpc_id                  = aws_vpc.csv_batch_vpc.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true
  
  tags = merge(var.tags, {
    Name = "csv-batch-public-subnet-${var.environment}"
    Type = "Public"
  })
}

# ×é¤ÙüÈµÖÍÃÈ\
resource "aws_subnet" "private_subnet" {
  vpc_id            = aws_vpc.csv_batch_vpc.id
  cidr_block        = var.private_subnet_cidr
  availability_zone = "${var.aws_region}a"
  
  tags = merge(var.tags, {
    Name = "csv-batch-private-subnet-${var.environment}"
    Type = "Private"
  })
}

# ×é¤ÙüÈµÖÍÃÈ2\Aurora(pAZÅ	
resource "aws_subnet" "private_subnet_2" {
  vpc_id            = aws_vpc.csv_batch_vpc.id
  cidr_block        = var.private_subnet_2_cidr
  availability_zone = "${var.aws_region}c"
  
  tags = merge(var.tags, {
    Name = "csv-batch-private-subnet-2-${var.environment}"
    Type = "Private"
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

# NAT²üÈ¦§¤\
resource "aws_nat_gateway" "csv_batch_nat" {
  allocation_id = aws_eip.nat_eip.id
  subnet_id     = aws_subnet.public_subnet.id
  
  tags = merge(var.tags, {
    Name = "csv-batch-nat-${var.environment}"
  })
  
  depends_on = [aws_internet_gateway.csv_batch_igw]
}

# ÑÖêÃ¯ëüÈÆüÖë
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

# ×é¤ÙüÈëüÈÆüÖë
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

# ëüÈÆüÖëhµÖÍÃÈn¢#ØQ
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

# Lambda(»­åêÆ£°ëü×
resource "aws_security_group" "lambda_sg" {
  name        = "csv-batch-lambda-sg-${var.environment}"
  description = "Security group for Lambda functions"
  vpc_id      = aws_vpc.csv_batch_vpc.id
  
  # Aurora PostgreSQLxn¢¯»¹1ï
  egress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.private_subnet_cidr, var.private_subnet_2_cidr]
  }
  
  # HTTPS¢¦ÈĞ¦óÉAWS API¢¯»¹(	
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  # HTTP ¢¦ÈĞ¦óÉÑÃ±ü¸À¦óíüÉI	
  egress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = merge(var.tags, {
    Name = "csv-batch-lambda-sg-${var.environment}"
  })
}

# Aurora(»­åêÆ£°ëü×
resource "aws_security_group" "aurora_sg" {
  name        = "csv-batch-aurora-sg-${var.environment}"
  description = "Security group for Aurora PostgreSQL"
  vpc_id      = aws_vpc.csv_batch_vpc.id
  
  # LambdaK‰n¢¯»¹1ï
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_sg.id]
  }
  
  tags = merge(var.tags, {
    Name = "csv-batch-aurora-sg-${var.environment}"
  })
}

# VPC¨óÉİ¤óÈ(»­åêÆ£°ëü×
resource "aws_security_group" "vpc_endpoint_sg" {
  name        = "csv-batch-vpce-sg-${var.environment}"
  description = "Security group for VPC Endpoints"
  vpc_id      = aws_vpc.csv_batch_vpc.id
  
  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_sg.id]
  }
  
  tags = merge(var.tags, {
    Name = "csv-batch-vpce-sg-${var.environment}"
  })
}