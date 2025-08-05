# S3モジュール - 統合データバケット定義
# 参照: 02-05_基本設計書_S3バケット設計.md

# 現在のAWSアカウントIDを取得
data "aws_caller_identity" "current" {}

# 統合S3バケット作成（設計書準拠）
resource "aws_s3_bucket" "processing" {
  bucket = "csv-processing-${data.aws_caller_identity.current.account_id}-${var.environment}"
  
  tags = merge(var.tags, {
    Name             = "csv-processing-${data.aws_caller_identity.current.account_id}-${var.environment}"
    Purpose          = "CSV processing and storage"
    Environment      = var.environment
    DataClassification = "Internal"
    Project          = "CSV-Processing"
    CostCenter       = "IT-Operations"
    Owner            = "data-platform-team"
  })
}

# バケット暗号化設定（SSE-S3、バケットキー有効）
resource "aws_s3_bucket_server_side_encryption_configuration" "processing" {
  bucket = aws_s3_bucket.processing.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# バケット公開アクセスブロック設定（セキュリティ強化）
resource "aws_s3_bucket_public_access_block" "processing" {
  bucket = aws_s3_bucket.processing.id
  
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# バケットバージョニング設定
resource "aws_s3_bucket_versioning" "processing" {
  bucket = aws_s3_bucket.processing.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

# 統一ライフサイクルポリシー設定（設計書準拠）
resource "aws_s3_bucket_lifecycle_configuration" "processing" {
  bucket = aws_s3_bucket.processing.id
  
  # 統一ライフサイクルルール
  rule {
    id     = "UnifiedLifecycle"
    status = "Enabled"
    
    # Standard-IAへの移行（7日後）
    transition {
      days          = var.standard_ia_transition_days
      storage_class = "STANDARD_IA"
    }
    
    # オブジェクト削除（30日後）
    expiration {
      days = var.retention_days
    }
    
    # 未完了のマルチパートアップロード削除
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
  
  # 失敗ファイル用ルール
  rule {
    id     = "DeleteFailedFiles"
    status = "Enabled"
    
    filter {
      prefix = "input/failed/"
    }
    
    expiration {
      days = 30
    }
  }
  
  # 処理済みファイル用ルール（早期削除）
  rule {
    id     = "DeleteProcessedFiles"
    status = "Enabled"
    
    filter {
      prefix = "input/processed/"
    }
    
    expiration {
      days = 7
    }
  }
}

# バケットポリシー設定（設計書準拠）
resource "aws_s3_bucket_policy" "processing" {
  bucket = aws_s3_bucket.processing.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureConnections"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.processing.arn,
          "${aws_s3_bucket.processing.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid    = "AllowStepFunctionsAccess"
        Effect = "Allow"
        Principal = {
          Service = "states.amazonaws.com"
        }
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:ListBucket",
          "s3:PutObject"
        ]
        Resource = [
          aws_s3_bucket.processing.arn,
          "${aws_s3_bucket.processing.arn}/*"
        ]
      },
      {
        Sid    = "AllowLambdaAccess"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.processing.arn}/*"
      }
    ]
  })
}

# CORS設定（外部システムアップロード対応）
resource "aws_s3_bucket_cors_configuration" "processing" {
  bucket = aws_s3_bucket.processing.id
  
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# EventBridge通知設定（S3イベント）
resource "aws_s3_bucket_notification" "processing" {
  bucket      = aws_s3_bucket.processing.id
  eventbridge = true
}

# CloudWatch メトリクス設定
resource "aws_s3_bucket_metric" "entire_bucket" {
  bucket = aws_s3_bucket.processing.id
  name   = "EntireBucket"
}

resource "aws_s3_bucket_metric" "incoming_files" {
  bucket = aws_s3_bucket.processing.id
  name   = "IncomingFiles"
  
  filter {
    prefix = "input/incoming/"
  }
}

resource "aws_s3_bucket_metric" "processing_files" {
  bucket = aws_s3_bucket.processing.id
  name   = "ProcessingFiles"
  
  filter {
    prefix = "input/processing/"
  }
}

# インテリジェントティアリング設定（コスト最適化）
resource "aws_s3_bucket_intelligent_tiering_configuration" "processing" {
  bucket = aws_s3_bucket.processing.id
  name   = "ProcessingDataTiering"
  
  status = "Enabled"
  
  # 全オブジェクトを対象
  filter {
    prefix = ""
  }
}