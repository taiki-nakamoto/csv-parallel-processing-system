# EventBridgeモジュール - CSV処理自動起動設定
# 参照: 02-03_基本設計書_EventBridgeルール基本設計.md

# EventBridgeルール作成（設計書準拠）
resource "aws_cloudwatch_event_rule" "csv_upload_processor" {
  name        = "${var.project_name}-csv-upload-processor-rule-${var.environment}"
  description = "S3へのCSVファイルアップロードを検知してStep Functionsを起動"
  state       = "ENABLED"

  event_pattern = jsonencode({
    source        = ["aws.s3"]
    detail-type   = ["Object Created"]
    detail = {
      bucket = {
        name = [var.s3_bucket_name]
      }
      object = {
        key = [
          {
            suffix = ".csv"
          }
        ]
        size = [
          {
            numeric = ["<=", 104857600]  # 100MB以下
          }
        ]
      }
      reason = ["PutObject", "PostObject", "CompleteMultipartUpload"]
    }
  })

  tags = merge(var.tags, {
    Name    = "${var.project_name}-csv-upload-processor-rule-${var.environment}"
    Purpose = "CSV processing trigger"
    Service = "EventBridge"
  })
}

# EventBridgeターゲット設定（Step Functions）
resource "aws_cloudwatch_event_target" "step_functions_target" {
  rule      = aws_cloudwatch_event_rule.csv_upload_processor.name
  target_id = "${var.project_name}-step-functions-target-${var.environment}"
  arn       = var.step_functions_arn

  # Step Functions実行時の入力変換
  input_transformer {
    input_paths = {
      bucket = "$.detail.bucket.name"
      key    = "$.detail.object.key"
      size   = "$.detail.object.size"
    }
    
    # Step Functions入力形式に変換
    input_template = "{\"bucket\": \"<bucket>\", \"key\": \"<key>\", \"size\": <size>, \"eventTime\": \"$.time\", \"eventSource\": \"s3.amazonaws.com\"}"
  }

  # 実行名の一意性確保（重複実行防止）
  role_arn = var.eventbridge_execution_role_arn

  depends_on = [aws_cloudwatch_event_rule.csv_upload_processor]
}