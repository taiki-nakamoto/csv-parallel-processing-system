# DynamoDBモジュール - テーブル定義
# 参照: 03-14_詳細設計書_データモデル詳細設計.md

# 監査ログテーブル（設計書準拠）
resource "aws_dynamodb_table" "audit_logs" {
  name           = "${var.project_name}-audit-logs-${var.environment}"
  billing_mode   = var.billing_mode
  hash_key       = "execution_id"
  range_key      = "timestamp"
  
  attribute {
    name = "execution_id"
    type = "S"
  }
  
  attribute {
    name = "timestamp"
    type = "S"
  }
  
  attribute {
    name = "log_level"
    type = "S"
  }
  
  attribute {
    name = "event_type"
    type = "S"
  }
  
  # ログレベル別検索用GSI
  global_secondary_index {
    name            = "LogLevelIndex"
    hash_key        = "log_level"
    range_key       = "timestamp"
    projection_type = "ALL"
  }
  
  # イベントタイプ別検索用GSI
  global_secondary_index {
    name            = "EventTypeIndex"
    hash_key        = "event_type"
    range_key       = "timestamp"
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
    enabled     = true
    kms_key_id  = var.kms_key_id
  }
  
  tags = merge(var.tags, {
    Name    = "${var.project_name}-audit-logs-${var.environment}"
    Purpose = "Audit log management"
    Project = "CSV-Processing"
  })
}

# 処理メタデータテーブル（設計書準拠）
resource "aws_dynamodb_table" "processing_metadata" {
  name           = "${var.project_name}-processing-metadata-${var.environment}"
  billing_mode   = var.billing_mode
  hash_key       = "file_id"
  range_key      = "processing_stage"
  
  attribute {
    name = "file_id"
    type = "S"
  }
  
  attribute {
    name = "processing_stage"
    type = "S"
  }
  
  attribute {
    name = "created_at"
    type = "S"
  }
  
  # 処理ステージ別検索用GSI
  global_secondary_index {
    name            = "ProcessingStageIndex"
    hash_key        = "processing_stage"
    range_key       = "created_at"
    projection_type = "ALL"
  }
  
  # TTL設定（30日後に自動削除）
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
    enabled     = true
    kms_key_id  = var.kms_key_id
  }
  
  tags = merge(var.tags, {
    Name    = "${var.project_name}-processing-metadata-${var.environment}"
    Purpose = "Processing metadata management"
    Project = "CSV-Processing"
  })
}

# バッチジョブ管理テーブル（既存を更新）
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
    name            = "status-created_at-index"
    hash_key        = "status"
    range_key       = "created_at"
    projection_type = "ALL"
  }
  
  # ファイル名別検索用GSI
  global_secondary_index {
    name            = "file_name-created_at-index"
    hash_key        = "file_name"
    range_key       = "created_at"
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
    enabled     = true
    kms_key_id  = var.kms_key_id
  }
  
  tags = merge(var.tags, {
    Name    = "${var.project_name}-batch-jobs-${var.environment}"
    Purpose = "Batch job management"
    Project = "CSV-Processing"
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
  
  # ポイントインタイムリカバリ有効化
  point_in_time_recovery {
    enabled = true
  }
  
  # 暗号化設定
  server_side_encryption {
    enabled     = true
    kms_key_id  = var.kms_key_id
  }
  
  tags = merge(var.tags, {
    Name    = "${var.project_name}-job-locks-${var.environment}"
    Purpose = "Job lock management"
    Project = "CSV-Processing"
  })
}