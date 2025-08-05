# DynamoDB‚∏Â¸Î - ∆¸÷Îö©
# ¬g: øπØ…≠Â·Û» DynamoDBÀ…ªØ∑ÁÛ

# „˚Ì∞∆¸÷Î\
resource "aws_dynamodb_table" "audit_logs" {
  name           = "csv-audit-logs-${var.environment}"
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
    name = "file_name"
    type = "S"
  }
  
  attribute {
    name = "status"
    type = "S"
  }
  
  # ∞Ì¸–Îª´Û¿Í§Û«√Øπ - ’°§Îkàã"
  global_secondary_index {
    name            = "FileNameIndex"
    hash_key        = "file_name"
    range_key       = "timestamp"
    projection_type = "ALL"
  }
  
  # ∞Ì¸–Îª´Û¿Í§Û«√Øπ - π∆¸øπkàã"
  global_secondary_index {
    name            = "StatusIndex"
    hash_key        = "status"
    range_key       = "timestamp"
    projection_type = "ALL"
  }
  
  # TTL-ö90ÂåÍ’Jd	
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
  
  # Jd›w,j∞Én	
  deletion_protection_enabled = var.environment == "prod" ? true : false
  
  # ó˜-ö
  server_side_encryption {
    enabled = true
  }
  
  # ›§Û»§Ûø§‡Í´–Í
  point_in_time_recovery {
    enabled = var.environment == "prod" ? true : false
  }
  
  tags = var.tags
}

# Auto Scaling-öPay-per-requestn4oÅ`LeÑj	ÙkôHfö©	
resource "aws_appautoscaling_target" "dynamodb_table_read_target" {
  count              = var.billing_mode == "PROVISIONED" ? 1 : 0
  max_capacity       = 100
  min_capacity       = 5
  resource_id        = "table/${aws_dynamodb_table.audit_logs.name}"
  scalable_dimension = "dynamodb:table:ReadCapacityUnits"
  service_namespace  = "dynamodb"
}

resource "aws_appautoscaling_target" "dynamodb_table_write_target" {
  count              = var.billing_mode == "PROVISIONED" ? 1 : 0
  max_capacity       = 100
  min_capacity       = 5
  resource_id        = "table/${aws_dynamodb_table.audit_logs.name}"
  scalable_dimension = "dynamodb:table:WriteCapacityUnits"
  service_namespace  = "dynamodb"
}

resource "aws_appautoscaling_policy" "dynamodb_table_read_policy" {
  count              = var.billing_mode == "PROVISIONED" ? 1 : 0
  name               = "DynamoDBReadCapacityUtilization:${aws_appautoscaling_target.dynamodb_table_read_target[0].resource_id}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.dynamodb_table_read_target[0].resource_id
  scalable_dimension = aws_appautoscaling_target.dynamodb_table_read_target[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.dynamodb_table_read_target[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "DynamoDBReadCapacityUtilization"
    }
    target_value = 70
  }
}

resource "aws_appautoscaling_policy" "dynamodb_table_write_policy" {
  count              = var.billing_mode == "PROVISIONED" ? 1 : 0
  name               = "DynamoDBWriteCapacityUtilization:${aws_appautoscaling_target.dynamodb_table_write_target[0].resource_id}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.dynamodb_table_write_target[0].resource_id
  scalable_dimension = aws_appautoscaling_target.dynamodb_table_write_target[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.dynamodb_table_write_target[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "DynamoDBWriteCapacityUtilization"
    }
    target_value = 70
  }
}