# IAMモジュール - ロール・ポリシー定義
# 参照: 03-01_詳細設計書_IAM設計.md

# Lambda実行ロール
resource "aws_iam_role" "lambda_execution_role" {
  name = "csv-lambda-execution-role-${var.environment}"
  
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
  
  tags = merge(var.tags, {
    Name = "csv-lambda-execution-role-${var.environment}"
  })
}

# Lambda基本実行ポリシーをアタッチ
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.lambda_execution_role.name
}

# Lambda VPC実行ポリシーをアタッチ
resource "aws_iam_role_policy_attachment" "lambda_vpc_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.lambda_execution_role.name
}

# Lambdaカスタムポリシー（S3、DynamoDB、Step Functions、Aurora）
resource "aws_iam_role_policy" "lambda_custom_policy" {
  name = "csv-lambda-custom-policy-${var.environment}"
  role = aws_iam_role.lambda_execution_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.project_name}-processing-${var.environment}",
          "arn:aws:s3:::${var.project_name}-processing-${var.environment}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:*:table/${var.project_name}-batch-jobs-${var.environment}",
          "arn:aws:dynamodb:${var.aws_region}:*:table/${var.project_name}-batch-jobs-${var.environment}/index/*",
          "arn:aws:dynamodb:${var.aws_region}:*:table/${var.project_name}-job-locks-${var.environment}"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "states:StartExecution",
          "states:DescribeExecution",
          "states:StopExecution"
        ]
        Resource = "arn:aws:states:${var.aws_region}:*:stateMachine:${var.project_name}-workflow-${var.environment}"
      },
      {
        Effect = "Allow"
        Action = [
          "rds:DescribeDBClusters",
          "rds:DescribeDBInstances"
        ]
        Resource = "*"
      }
    ]
  })
}

# Step Functions実行ロール
resource "aws_iam_role" "step_functions_execution_role" {
  name = "csv-step-functions-execution-role-${var.environment}"
  
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
  
  tags = merge(var.tags, {
    Name = "csv-step-functions-execution-role-${var.environment}"
  })
}

# Step Functions Lambda呼び出しポリシー
resource "aws_iam_role_policy" "step_functions_lambda_policy" {
  name = "csv-step-functions-lambda-policy-${var.environment}"
  role = aws_iam_role.step_functions_execution_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = "arn:aws:lambda:${var.aws_region}:*:function:${var.project_name}-*-${var.environment}"
      }
    ]
  })
}

# CloudWatch Logs書き込みポリシー
resource "aws_iam_role_policy" "step_functions_logs_policy" {
  name = "csv-step-functions-logs-policy-${var.environment}"
  role = aws_iam_role.step_functions_execution_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogDelivery",
          "logs:GetLogDelivery",
          "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies",
          "logs:DescribeLogGroups"
        ]
        Resource = "*"
      }
    ]
  })
}