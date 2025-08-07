# IAMモジュール - ロール・ポリシー定義
# 参照: 03-01_詳細設計書_インフラ詳細設計.md
# 統合Lambda関数（csv-processor）とStep Functions用のIAMロール

# 統合Lambda関数用実行ロール
resource "aws_iam_role" "lambda_processor_role" {
  name = "csv-lambda-processor-role-${var.environment}"
  
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
    Name = "csv-lambda-processor-role-${var.environment}"
    Purpose = "Unified Lambda function execution role"
    Service = "csv-processor"
  })
}

# Lambda基本実行ポリシーをアタッチ
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.lambda_processor_role.name
}

# Lambda VPC実行ポリシーをアタッチ
resource "aws_iam_role_policy_attachment" "lambda_vpc_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.lambda_processor_role.name
}

# 統合Lambda関数用カスタムポリシー（設計書準拠）
resource "aws_iam_role_policy" "lambda_processor_policy" {
  name = "csv-lambda-processor-policy-${var.environment}"
  role = aws_iam_role.lambda_processor_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid = "S3InputBucketAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = [
          "arn:aws:s3:::csv-processing-*-${var.environment}/input/incoming/*",
          "arn:aws:s3:::csv-processing-*-${var.environment}/input/processing/*"
        ]
      },
      {
        Sid = "S3OutputBucketAccess"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = [
          "arn:aws:s3:::csv-processing-*-${var.environment}/output/results/*",
          "arn:aws:s3:::csv-processing-*-${var.environment}/output/reports/*",
          "arn:aws:s3:::csv-processing-*-${var.environment}/output/errors/*"
        ]
      },
      {
        Sid = "S3FileMovement"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = [
          "arn:aws:s3:::csv-processing-*-${var.environment}/input/processing/*",
          "arn:aws:s3:::csv-processing-*-${var.environment}/input/processed/*",
          "arn:aws:s3:::csv-processing-*-${var.environment}/input/failed/*"
        ]
      },
      {
        Sid = "S3BucketList"
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = "arn:aws:s3:::csv-processing-*-${var.environment}"
        Condition = {
          StringLike = {
            "s3:prefix" = [
              "input/incoming/*",
              "input/processing/*",
              "output/*"
            ]
          }
        }
      },
      {
        Sid = "DynamoDBFullAccess"
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
          "arn:aws:dynamodb:${var.aws_region}:*:table/${var.project_name}-audit-logs-${var.environment}",
          "arn:aws:dynamodb:${var.aws_region}:*:table/${var.project_name}-processing-metadata-${var.environment}",
          "arn:aws:dynamodb:${var.aws_region}:*:table/${var.project_name}-batch-jobs-${var.environment}",
          "arn:aws:dynamodb:${var.aws_region}:*:table/${var.project_name}-job-locks-${var.environment}"
        ]
      },
      {
        Sid = "DynamoDBIndexAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:Query"
        ]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:*:table/${var.project_name}-*-${var.environment}/index/*"
        ]
      },
      {
        Sid = "AuroraDBAccess"
        Effect = "Allow"
        Action = [
          "rds-db:connect"
        ]
        Resource = "arn:aws:rds-db:${var.aws_region}:*:dbuser:${var.project_name}-aurora-${var.environment}/lambda_user"
      },
      {
        Sid = "SecretsManagerAccess"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:${var.project_name}/aurora-credentials-*"
      }
    ]
  })
}

# Step Functions実行ロール（設計書準拠）
resource "aws_iam_role" "step_functions_execution_role" {
  name = "csv-stepfunctions-execution-role-${var.environment}"
  
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
    Name = "csv-stepfunctions-execution-role-${var.environment}"
    Purpose = "Step Functions execution role"
    Service = "csv-processing-workflow"
  })
}

# Step Functions実行ポリシー（設計書準拠）
resource "aws_iam_role_policy" "step_functions_execution_policy" {
  name = "csv-stepfunctions-execution-policy-${var.environment}"
  role = aws_iam_role.step_functions_execution_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid = "InvokeLambdaFunctions"
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          "arn:aws:lambda:${var.aws_region}:*:function:csv-processor-${var.environment}"
        ]
      },
      {
        Sid = "CloudWatchLogsAccess"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:CreateLogDelivery",
          "logs:GetLogDelivery",
          "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies"
        ]
        Resource = "*"
      },
      {
        Sid = "DistributedMapAccess"
        Effect = "Allow"
        Action = [
          "states:DescribeExecution",
          "states:StartExecution",
          "states:StopExecution"
        ]
        Resource = [
          "arn:aws:states:${var.aws_region}:*:stateMachine:csv-processing-workflow-${var.environment}",
          "arn:aws:states:${var.aws_region}:*:execution:csv-processing-workflow-${var.environment}:*"
        ]
      },
      {
        Sid = "S3ResultWriterAccess"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = [
          "arn:aws:s3:::csv-processing-*-${var.environment}/output/results/*"
        ]
      }
    ]
  })
}

# EventBridge実行ロール（設計書準拠：02-03_EventBridgeルール基本設計）
resource "aws_iam_role" "eventbridge_execution_role" {
  name = "${var.project_name}-eventbridge-execution-role-${var.environment}"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
      }
    ]
  })
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-eventbridge-execution-role-${var.environment}"
    Purpose = "EventBridge execution role"
    Service = "csv-processing-trigger"
  })
}

# EventBridge実行ポリシー（Step Functions起動権限）
resource "aws_iam_role_policy" "eventbridge_execution_policy" {
  name = "${var.project_name}-eventbridge-execution-policy-${var.environment}"
  role = aws_iam_role.eventbridge_execution_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid = "StepFunctionsStartExecution"
        Effect = "Allow"
        Action = [
          "states:StartExecution"
        ]
        Resource = [
          "arn:aws:states:${var.aws_region}:*:stateMachine:${var.project_name}-csv-processing-${var.environment}",
          "arn:aws:states:${var.aws_region}:*:execution:${var.project_name}-csv-processing-${var.environment}:*"
        ]
      }
    ]
  })
}

# データソース（他リソースから参照される）
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}