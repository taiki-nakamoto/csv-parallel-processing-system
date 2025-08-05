# DynamoDBモジュール - テーブル定義
# 参照: 基本設計書 DynamoDBテーブル設計

# バッチジョブ管理テーブル
resource "aws_dynamodb_table" "batch_jobs" {
  name           = "${var.project_name}-batch-jobs-${var.environment}"
  billing_mode   = var.billing_mode
  hash_key       = "job_id"
  range_key      = "created_at"
  
  attribute {
    name = "job_id"
    type = "S"
  }
  
  attribute {
    name = "created_at"
    type = "S"
  }
  
  attribute {
    name = "status"
    type = "S"
  }
  
  attribute {
    name = "file_name"
    type = "S"
  }
  
  # ステータス別検索用GSI
  global_secondary_index {
    name     = "status-created_at-index"
    hash_key = "status"
    range_key = "created_at"
    projection_type = "ALL"
  }
  
  # ファイル名別検索用GSI
  global_secondary_index {
    name     = "file_name-created_at-index"
    hash_key = "file_name"
    range_key = "created_at"
    projection_type = "ALL"
  }
  
  # TTL設定（90日後に自動削除）
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
  
  # ポイントインタイムリカバリ有効化
  point_in_time_recovery {
    enabled = true
  }
  
  # 暗号化設定
  server_side_encryption {
    enabled = true
  }
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-batch-jobs-${var.environment}"
    Purpose = "Batch job management"
  })
}

# ジョブロック管理テーブル（同時実行制御）
resource "aws_dynamodb_table" "job_locks" {
  name           = "${var.project_name}-job-locks-${var.environment}"
  billing_mode   = var.billing_mode
  hash_key       = "lock_key"
  
  attribute {
    name = "lock_key"
    type = "S"
  }
  
  # TTL設定（ロック自動解除用）
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
  
  # 暗号化設定
  server_side_encryption {
    enabled = true
  }
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-job-locks-${var.environment}"
    Purpose = "Job lock management"
  })
}