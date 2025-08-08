# AWS SAM環境構築手順

## 概要
本手順書は、CSV並列処理システムのLambda関数・Step Functions・Lambda LayersをAWS SAMでデプロイするための手順を記載しています。

**前提条件**: Terraformによるインフラ構築が完了していること（01_AWS環境構築手順.md参照）

## 前提条件
- AWS CLIがインストール済み
- AWS SAM CLIがインストール済み（バージョン1.100以上）
- Docker Desktopがインストール済み・起動済み
- Node.js 22.x以上がインストール済み
- PostgreSQLクライアント（psql）がインストール済み
- AWS認証情報が設定済み（`aws configure`実行済み）
- Terraformによるインフラ構築が完了済み

## 構築対象リソース
- Lambda関数（csv-processor統合関数）
- Lambda Layers（3層：共通ユーティリティ・AWS SDK Wrapper・ビジネスロジック）
- Step Functionsステートマシン（分散マップ対応）
- CloudWatchログ設定

## 手順

### 1. リポジトリの準備
```bash
# csv-parallel-processing-systemのsamディレクトリに移動
cd csv-parallel-processing-system/sam
```

### 2. 依存関係のインストール
```bash
# メインのpackage.jsonの依存関係をインストール
npm install

# 各Lambda Layerの依存関係をインストール
cd layers/common-utils/nodejs && npm install && cd ../../../
cd layers/aws-sdk-wrapper/nodejs && npm install && cd ../../../
cd layers/business-logic/nodejs && npm install && cd ../../../
```

### 3. Aurora PostgreSQLスキーマの適用

#### PostgreSQLクライアントのインストール（未インストールの場合）
```bash
# Ubuntu/Debian の場合
sudo apt update && sudo apt install -y postgresql-client

# CentOS/RHEL の場合
sudo yum install -y postgresql

# macOS の場合（Homebrew）
brew install postgresql
```

#### スキーマ適用実行
```bash
# Terraformディレクトリに移動（エンドポイント取得のため）
cd ../terraform

# Aurora PostgreSQLエンドポイントをTerraform出力から取得
export AURORA_ENDPOINT=$(terraform output -raw aurora_cluster_endpoint)

# データベーススキーマを適用
psql -h $AURORA_ENDPOINT -U postgres -d csv_processing -f ../scripts/aurora-schema.sql

# samディレクトリに戻る
cd ../sam
```

成功時の確認：
```sql
-- テーブル作成確認
\dt
```
6つのテーブル（users, user_statistics, processing_executions, file_processing_results, batch_processing_logs, system_configurations）が表示されること

### 4. SAMビルドの実行
```bash
# コンテナベースでのビルド（推奨）
sam build --use-container
```

成功時の出力例：
```
Build Succeeded

Built Artifacts  : .aws-sam/build
Built Template   : .aws-sam/build/template.yaml

Commands you can use next
=========================
[*] Validate SAM template: sam validate
[*] Invoke Function: sam local invoke
[*] Test Function in the Cloud: sam sync --stack-name {{stack-name}} --watch
[*] Deploy: sam deploy --guided
```

### 5. SAMデプロイの実行（初回）
```bash
# ガイド付きデプロイ（初回のみ）
sam deploy --guided
```

初回デプロイ時の設定項目：
- **Stack Name**: `csv-parallel-processing-sam-dev`
- **AWS Region**: `ap-northeast-1`
- **Parameter ProjectName**: `csv-parallel-processing`
- **Parameter Environment**: `dev`
- **Confirm changes before deploy**: `Y`
- **Allow SAM CLI to create IAM roles**: `Y`
- **Disable rollback**: `N`
- **Save parameters to configuration file**: `Y`
- **SAM configuration file**: `samconfig.toml` (デフォルト)
- **SAM configuration environment**: `default` (デフォルト)

### 6. SAMデプロイの実行（2回目以降）
```bash
# 設定ファイルを使用したデプロイ
sam deploy
```

デプロイ時間の目安：
- Lambda Layers作成: 約2-3分
- Lambda関数デプロイ: 約2-3分  
- Step Functions作成: 約1分
- 合計: 約5-7分

### 7. デプロイ結果の確認
```bash
# スタック出力値の確認
aws cloudformation describe-stacks \
  --stack-name csv-parallel-processing-sam-dev \
  --query 'Stacks[0].Outputs'
```

出力される主な情報：
- CsvProcessorFunctionArn
- CsvProcessingStateMachineArn
- CommonUtilsLayerArn
- AwsSdkWrapperLayerArn
- BusinessLogicLayerArn

### 8. 構築確認チェックリスト

#### Lambda関数・Layer関連
AWSマネジメントコンソールで以下を確認：

**Lambda関数**
- [ ] csv-processor-dev が作成されている
- [ ] 関数の環境変数が設定されている（15項目）
- [ ] VPC設定されている（プライベートサブネット2つ）
- [ ] セキュリティグループが設定されている（Lambda用SG）
- [ ] 3つのLambda Layersがアタッチされている

**Lambda Layers**
- [ ] csv-parallel-processing-common-utils-layer-dev が作成されている
- [ ] csv-parallel-processing-aws-sdk-wrapper-layer-dev が作成されている
- [ ] csv-parallel-processing-business-logic-layer-dev が作成されている

#### Step Functions関連
**Step Functions**
- [ ] csv-parallel-processing-csv-processing-dev ステートマシンが作成されている
- [ ] ログ設定が有効になっている
- [ ] 実行履歴が記録される設定になっている

#### CloudWatch Logs関連
**ログ設定**
- [ ] /aws/lambda/csv-processor-dev ロググループが作成されている
- [ ] /aws/stepfunctions/csv-parallel-processing-csv-processing-dev ロググループが作成されている

#### IAM関連
**IAM権限**
- [ ] Lambda実行ロールに必要な権限がアタッチされている
- [ ] Step Functions実行ロールに必要な権限がアタッチされている

### 9. 動作確認

#### Lambda関数の確認
```bash
# Lambda関数の基本情報確認
aws lambda get-function --function-name csv-processor-dev
```

#### Step Functions動作確認
```bash
# Step Functions実行テスト
aws stepfunctions start-execution \
  --state-machine-arn "arn:aws:states:ap-northeast-1:526636471122:stateMachine:csv-parallel-processing-csv-processing-dev" \
  --name "test-execution-$(date +%Y%m%d-%H%M%S)" \
  --input '{
    "bucketName": "csv-processing-526636471122-dev", 
    "objectKey": "input/test-sample.csv"
  }'
```

実行成功の確認：
- 実行ARNが返される
- Step Functionsコンソールで実行状態を確認できる
- CloudWatchでログが出力される

## トラブルシューティング

### sam buildでエラーが発生する場合
```bash
# ビルドキャッシュをクリア
sam build --use-container --cached

# Dockerコンテナの確認
docker ps -a
docker system prune -f
```

### Lambda関数のデプロイエラー
```bash
# VPC設定エラーの場合はTerraformの出力値を確認
terraform output -raw lambda_security_group_id
terraform output -raw private_subnet_ids
```

### Step Functions実行エラー
```bash
# 実行ログの確認
aws stepfunctions describe-execution \
  --execution-arn "実行ARN"

# CloudWatchログの確認
aws logs describe-log-streams \
  --log-group-name /aws/stepfunctions/csv-parallel-processing-csv-processing-dev
```

### Aurora接続エラー
```bash
# Auroraクラスターの正しいSecret ARN取得
SECRET_ARN=$(aws rds describe-db-clusters \
  --db-cluster-identifier csv-parallel-processing-aurora-dev \
  --query 'DBClusters[0].MasterUserSecret.SecretArn' \
  --output text)

# Secrets Managerからパスワード取得
aws secretsmanager get-secret-value \
  --secret-id $SECRET_ARN \
  --query 'SecretString' \
  --output text

# VPCエンドポイント確認
aws ec2 describe-vpc-endpoints \
  --filters "Name=service-name,Values=com.amazonaws.ap-northeast-1.secretsmanager"

# セキュリティグループ確認
aws ec2 describe-security-groups \
  --group-ids $(terraform output -raw aurora_security_group_id)
```

#### Aurora接続が失敗する場合の対処法
Auroraクラスターがプライベートサブネット内にある場合、外部から直接接続できません。以下の方法で対処してください：

**方法1: EC2踏み台サーバー経由**
```bash
# EC2インスタンスを作成してpsqlコマンドを実行
# （本番環境では踏み台サーバーを予め用意することを推奨）

# 方法2: Lambda関数経由でスキーマ適用
# スキーマ適用専用のLambda関数を作成して実行
```

**方法2: AWS RDS Data API使用**
```bash
# RDS Data APIでスキーマ適用（Aurora Serverless v2で利用可能）
aws rds-data execute-statement \
  --resource-arn $(terraform output -raw aurora_cluster_arn) \
  --secret-arn $SECRET_ARN \
  --database csvbatch \
  --sql "$(cat ../scripts/aurora-schema.sql)"
```

## 環境削除手順

### SAMリソースの削除
```bash
# SAMスタック削除
aws cloudformation delete-stack \
  --stack-name csv-parallel-processing-sam-dev

# 削除完了確認
aws cloudformation describe-stacks \
  --stack-name csv-parallel-processing-sam-dev
```

### Aurora スキーマの削除（必要に応じて）
```bash
# テーブル削除（必要な場合のみ）
psql -h $AURORA_ENDPOINT -U postgres -d csv_processing -c "
DROP TABLE IF EXISTS batch_processing_logs CASCADE;
DROP TABLE IF EXISTS file_processing_results CASCADE;  
DROP TABLE IF EXISTS processing_executions CASCADE;
DROP TABLE IF EXISTS user_statistics CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS system_configurations CASCADE;
"
```

## 関連ドキュメント
- [01_AWS環境構築手順.md](./01_AWS環境構築手順.md) - Terraform環境構築
- [製造タスク実装状況チェック](../02_Tasks/20250806_01_製造タスク実装状況チェック.md) - 実装完了状況