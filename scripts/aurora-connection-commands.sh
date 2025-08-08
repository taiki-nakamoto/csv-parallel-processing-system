#!/bin/bash
# ============================================
# Aurora PostgreSQL 接続・確認用コマンド集
# ============================================

# 色付き出力用の設定
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Aurora PostgreSQL 接続・確認コマンド ===${NC}"

# 1. 環境変数設定
echo -e "\n${YELLOW}1. 環境変数設定${NC}"
cat << 'EOF'
# Terraform出力から情報取得
export AURORA_ENDPOINT=$(terraform output -raw aurora_cluster_endpoint)
export AURORA_DATABASE=$(terraform output -raw aurora_database_name)

# または直接指定
export AURORA_ENDPOINT="csv-parallel-processing-aurora-dev.cluster-cbuqsk2gi5o4.ap-northeast-1.rds.amazonaws.com"
export AURORA_DATABASE="csvbatch"
export POSTGRES_USER="postgres"

# Secrets Managerからパスワード取得
SECRET_ARN=$(aws rds describe-db-clusters \
  --db-cluster-identifier csv-parallel-processing-aurora-dev \
  --query 'DBClusters[0].MasterUserSecret.SecretArn' \
  --output text)

export POSTGRES_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id $SECRET_ARN \
  --query 'SecretString' \
  --output text | jq -r '.password')
EOF

# 2. 基本接続確認
echo -e "\n${YELLOW}2. 基本接続確認${NC}"
cat << 'EOF'
# 基本接続テスト
PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$AURORA_ENDPOINT" \
  -U "$POSTGRES_USER" \
  -d "$AURORA_DATABASE" \
  -c "SELECT current_database(), current_user, version();"
EOF

# 3. テーブル一覧確認
echo -e "\n${YELLOW}3. テーブル一覧確認${NC}"
cat << 'EOF'
# 作成されたテーブル確認
PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$AURORA_ENDPOINT" \
  -U "$POSTGRES_USER" \
  -d "$AURORA_DATABASE" \
  -c "\dt"
EOF

# 4. 簡単なテーブル確認
echo -e "\n${YELLOW}4. 各テーブルのレコード数確認${NC}"
cat << 'EOF'
# テーブル別レコード数
PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$AURORA_ENDPOINT" \
  -U "$POSTGRES_USER" \
  -d "$AURORA_DATABASE" \
  -c "
    SELECT 'users' as table_name, count(*) as records FROM users
    UNION ALL
    SELECT 'system_configurations', count(*) FROM system_configurations
    UNION ALL
    SELECT 'processing_executions', count(*) FROM processing_executions
    UNION ALL
    SELECT 'file_processing_results', count(*) FROM file_processing_results
    UNION ALL
    SELECT 'batch_processing_logs', count(*) FROM batch_processing_logs
    UNION ALL
    SELECT 'user_statistics', count(*) FROM user_statistics
    ORDER BY table_name;
  "
EOF

# 5. システム設定確認
echo -e "\n${YELLOW}5. システム設定データ確認${NC}"
cat << 'EOF'
# システム設定の初期データ確認
PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$AURORA_ENDPOINT" \
  -U "$POSTGRES_USER" \
  -d "$AURORA_DATABASE" \
  -c "SELECT config_key, config_value, description FROM system_configurations ORDER BY config_key;"
EOF

# 6. 詳細スキーマ確認
echo -e "\n${YELLOW}6. 詳細スキーマ確認（SQLファイル使用）${NC}"
cat << 'EOF'
# 詳細な確認（verify-aurora-schema.sql使用）
PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$AURORA_ENDPOINT" \
  -U "$POSTGRES_USER" \
  -d "$AURORA_DATABASE" \
  -f scripts/verify-aurora-schema.sql
EOF

# 7. インタラクティブ接続
echo -e "\n${YELLOW}7. インタラクティブ接続${NC}"
cat << 'EOF'
# 対話モードでの接続
PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$AURORA_ENDPOINT" \
  -U "$POSTGRES_USER" \
  -d "$AURORA_DATABASE"
EOF

# 8. 接続トラブルシューティング
echo -e "\n${YELLOW}8. 接続トラブルシューティング${NC}"
cat << 'EOF'
# 接続テスト（詳細エラー表示）
PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$AURORA_ENDPOINT" \
  -U "$POSTGRES_USER" \
  -d "$AURORA_DATABASE" \
  -c "SELECT 1;" \
  --echo-errors \
  --echo-all

# セキュリティグループ確認
aws ec2 describe-security-groups \
  --group-ids $(terraform output -raw aurora_security_group_id)

# Aurora クラスター状態確認
aws rds describe-db-clusters \
  --db-cluster-identifier csv-parallel-processing-aurora-dev \
  --query 'DBClusters[0].{Status:Status,Endpoint:Endpoint,Port:Port,DatabaseName:DatabaseName}'
EOF

echo -e "\n${GREEN}使用方法：${NC}"
echo "1. 上記のコマンドをコピー＆ペーストして実行"
echo "2. または、このスクリプトを実行: bash scripts/aurora-connection-commands.sh"
echo "3. 詳細確認: scripts/verify-aurora-schema.sql を実行"

echo -e "\n${GREEN}ファイル場所：${NC}"
echo "- DDLファイル: scripts/aurora-schema.sql"
echo "- 確認用SQLファイル: scripts/verify-aurora-schema.sql"
echo "- このコマンド集: scripts/aurora-connection-commands.sh"