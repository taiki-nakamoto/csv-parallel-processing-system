# IAMâ¸åüë - íüëÝê·ü
# Âg: 03-01_s0-ø_¤óÕés0-.md

# Step FunctionsŸLíüë
resource "aws_iam_role" "stepfunctions_execution_role" {
  name = "csv-batch-stepfunctions-role-${var.environment}"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "states.amazonaws.com"
        }
      }
    ]
  })
  
  tags = var.tags
}

# Step FunctionscÞÃ×(Ýê·ü
resource "aws_iam_policy" "stepfunctions_distributed_map_policy" {
  name        = "csv-batch-stepfunctions-distributed-map-policy-${var.environment}"
  description = "Policy for Step Functions distributed map processing"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:csv-processor-${var.environment}",
          "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:csv-processor-${var.environment}:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.s3_bucket_name}",
          "arn:aws:s3:::${var.s3_bucket_name}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = [
          "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/stepfunctions/*"
        ]
      }
    ]
  })
  
  tags = var.tags
}

# Step FunctionsíüëkÝê·ü¢¿ÃÁ
resource "aws_iam_role_policy_attachment" "stepfunctions_distributed_map" {
  role       = aws_iam_role.stepfunctions_execution_role.name
  policy_arn = aws_iam_policy.stepfunctions_distributed_map_policy.arn
}

# LambdaŸLíüë
resource "aws_iam_role" "lambda_execution_role" {
  name = "csv-batch-lambda-role-${var.environment}"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
  
  tags = var.tags
}

# Lambda VPC¥šÝê·ü
resource "aws_iam_policy" "lambda_vpc_policy" {
  name        = "csv-batch-lambda-vpc-policy-${var.environment}"
  description = "Policy for Lambda VPC access"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:AttachNetworkInterface",
          "ec2:DetachNetworkInterface"
        ]
        Resource = "*"
      }
    ]
  })
  
  tags = var.tags
}

# Lambda S3¢¯»¹Ýê·ü
resource "aws_iam_policy" "lambda_s3_policy" {
  name        = "csv-batch-lambda-s3-policy-${var.environment}"
  description = "Policy for Lambda S3 access"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = [
          "arn:aws:s3:::${var.s3_bucket_name}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.s3_bucket_name}"
        ]
      }
    ]
  })
  
  tags = var.tags
}

# Lambda DynamoDB¢¯»¹Ýê·ü
resource "aws_iam_policy" "lambda_dynamodb_policy" {
  name        = "csv-batch-lambda-dynamodb-policy-${var.environment}"
  description = "Policy for Lambda DynamoDB access"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/csv-audit-logs-${var.environment}",
          "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/csv-audit-logs-${var.environment}/index/*"
        ]
      }
    ]
  })
  
  tags = var.tags
}

# Lambda RDS Aurora¢¯»¹Ýê·ü
resource "aws_iam_policy" "lambda_rds_policy" {
  name        = "csv-batch-lambda-rds-policy-${var.environment}"
  description = "Policy for Lambda Aurora access"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:ExecuteStatement",
          "rds-data:RollbackTransaction"
        ]
        Resource = [
          "arn:aws:rds:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:cluster:csv-batch-aurora-${var.environment}"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:rds-db-credentials/*"
        ]
      }
    ]
  })
  
  tags = var.tags
}

# Lambda CloudWatch LogsÝê·ü
resource "aws_iam_policy" "lambda_logs_policy" {
  name        = "csv-batch-lambda-logs-policy-${var.environment}"
  description = "Policy for Lambda CloudWatch Logs access"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [
          "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/csv-processor-${var.environment}:*"
        ]
      }
    ]
  })
  
  tags = var.tags
}

# Lambda X-RayÝê·ü
resource "aws_iam_policy" "lambda_xray_policy" {
  name        = "csv-batch-lambda-xray-policy-${var.environment}"
  description = "Policy for Lambda X-Ray tracing"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      }
    ]
  })
  
  tags = var.tags
}

# LambdaŸLíüëkÝê·ü’¢¿ÃÁ
resource "aws_iam_role_policy_attachment" "lambda_vpc_attachment" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_vpc_policy.arn
}

resource "aws_iam_role_policy_attachment" "lambda_s3_attachment" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_s3_policy.arn
}

resource "aws_iam_role_policy_attachment" "lambda_dynamodb_attachment" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_dynamodb_policy.arn
}

resource "aws_iam_role_policy_attachment" "lambda_rds_attachment" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_rds_policy.arn
}

resource "aws_iam_role_policy_attachment" "lambda_logs_attachment" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_logs_policy.arn
}

resource "aws_iam_role_policy_attachment" "lambda_xray_attachment" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_xray_policy.arn
}

# Çü¿½ü¹
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}