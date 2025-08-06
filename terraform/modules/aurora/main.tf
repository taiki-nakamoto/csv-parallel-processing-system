# Aurora PostgreSQLモジュール - データベースクラスター定義
# 参照: 03-14_詳細設計書_データモデル詳細設計.md

# Aurora PostgreSQL Serverless v2 クラスター
resource "aws_rds_cluster" "csv_batch_cluster" {
  cluster_identifier      = "${var.project_name}-aurora-${var.environment}"
  engine                  = "aurora-postgresql"
  engine_version          = var.engine_version
  database_name           = var.database_name
  master_username         = var.master_username
  manage_master_user_password = true
  
  # ネットワーク設定
  vpc_security_group_ids = var.security_group_ids
  db_subnet_group_name   = aws_db_subnet_group.aurora_subnet_group.name
  
  # Serverless v2 設定
  serverlessv2_scaling_configuration {
    max_capacity = var.max_capacity
    min_capacity = var.min_capacity
  }
  
  # バックアップ設定
  backup_retention_period   = var.backup_retention_period
  # backup_window            = var.backup_window  # Aurora Serverless v2では非対応
  # maintenance_window       = var.maintenance_window  # Aurora Serverless v2では非対応
  copy_tags_to_snapshot    = true
  
  # セキュリティ設定
  storage_encrypted = true
  kms_key_id       = var.kms_key_id
  
  # 削除設定
  skip_final_snapshot       = var.environment == "dev" ? true : false
  final_snapshot_identifier = var.environment != "dev" ? "${var.project_name}-aurora-final-snapshot-${var.environment}-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null
  deletion_protection       = var.environment == "prod" ? true : false
  
  # ログ設定
  enabled_cloudwatch_logs_exports = ["postgresql"]
  
  tags = merge(var.tags, {
    Name        = "${var.project_name}-aurora-${var.environment}"
    Engine      = "aurora-postgresql"
    Version     = var.engine_version
    Environment = var.environment
  })
  
  lifecycle {
    ignore_changes = [
      master_password,
      final_snapshot_identifier
    ]
  }
}

# Aurora PostgreSQL インスタンス（Serverless v2）
resource "aws_rds_cluster_instance" "csv_batch_instance" {
  count              = var.instance_count
  identifier         = "${var.project_name}-aurora-${var.environment}-${count.index + 1}"
  cluster_identifier = aws_rds_cluster.csv_batch_cluster.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.csv_batch_cluster.engine
  engine_version     = aws_rds_cluster.csv_batch_cluster.engine_version
  
  # パフォーマンス監視
  performance_insights_enabled = true
  performance_insights_retention_period = var.environment == "prod" ? 731 : 7
  
  # 監視設定
  monitoring_interval = 0  # 0に設定（monitoring_role_arnが未設定のため）
  # monitoring_role_arn = var.monitoring_role_arn  # 今後、監視ロールを作成後に有効化
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-aurora-instance-${var.environment}-${count.index + 1}"
  })
}

# DBサブネットグループ
resource "aws_db_subnet_group" "aurora_subnet_group" {
  name       = "${var.project_name}-aurora-subnet-group-${var.environment}"
  subnet_ids = var.subnet_ids
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-aurora-subnet-group-${var.environment}"
  })
}

# DBパラメータグループ
resource "aws_db_parameter_group" "aurora_pg" {
  family = "aurora-postgresql17"
  name   = "${var.project_name}-aurora-pg-${var.environment}"
  
  # パフォーマンス最適化設定
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }
  
  parameter {
    name  = "log_statement"
    value = "all"
  }
  
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"  # 1秒以上のクエリをログ出力
  }
  
  # log_checkpointsはAurora PostgreSQL 17では利用不可のためコメントアウト
  # parameter {
  #   name  = "log_checkpoints"
  #   value = "1"
  # }
  
  parameter {
    name  = "log_connections"
    value = "1"
  }
  
  parameter {
    name  = "log_disconnections"
    value = "1"
  }
  
  # 統計収集設定
  parameter {
    name  = "track_activity_query_size"
    value = "2048"
  }
  
  parameter {
    name  = "pg_stat_statements.track"
    value = "all"
  }
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-aurora-parameter-group-${var.environment}"
  })
}

# DBクラスターパラメータグループ
resource "aws_rds_cluster_parameter_group" "aurora_cluster_pg" {
  family = "aurora-postgresql17"
  name   = "${var.project_name}-aurora-cluster-pg-${var.environment}"
  
  # ログ設定
  parameter {
    name  = "log_statement"
    value = "ddl"
  }
  
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-aurora-cluster-parameter-group-${var.environment}"
  })
}

# Aurora クラスターにパラメータグループを適用
# 以下のリソースは不要なため削除（上記のクラスター定義で対応済み）
# resource "aws_rds_cluster" "csv_batch_cluster_with_params" {
#   count = 0
# }

# CloudWatch Log Group (Aurora PostgreSQL ログ用)
resource "aws_cloudwatch_log_group" "aurora_postgresql" {
  name              = "/aws/rds/cluster/${aws_rds_cluster.csv_batch_cluster.cluster_identifier}/postgresql"
  retention_in_days = var.log_retention_days
  
  tags = merge(var.tags, {
    Name = "aurora-postgresql-logs-${var.environment}"
  })
}

# データベース初期化用 null_resource
resource "null_resource" "database_initialization" {
  depends_on = [aws_rds_cluster_instance.csv_batch_instance]
  
  triggers = {
    cluster_endpoint = aws_rds_cluster.csv_batch_cluster.endpoint
    database_name    = var.database_name
  }
  
  # データベース初期化は別途Lambda関数またはスクリプトで実行する想定
  # 初期テーブル作成、インデックス作成、初期データ投入等
  
  provisioner "local-exec" {
    command = "echo 'Database cluster ${aws_rds_cluster.csv_batch_cluster.cluster_identifier} is ready for initialization'"
  }
}