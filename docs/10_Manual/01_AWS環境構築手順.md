# AWS環境構築手順

## 概要
本手順書は、CSV並列処理システムのAWSインフラをTerraformで構築するための手順を記載しています。

## 前提条件
- AWS CLIがインストール済み
- Terraformがインストール済み（バージョン1.5以上）
- AWS認証情報が設定済み（`aws configure`実行済み）
- 必要なIAM権限を持つAWSアカウント

## 構築対象リソース
- VPC/サブネット（Network）
- Aurora PostgreSQL
- DynamoDB
- S3バケット
- Lambda関数
- Step Functions
- CloudWatch
- IAMロール/ポリシー

## 手順

### 1. リポジトリのクローン
```bash
git clone <repository-url>
cd csv-parallel-processing-system/terraform
```

### 2. 環境変数の設定
```bash
# 開発環境の場合
export TF_VAR_environment=dev

# 本番環境の場合
export TF_VAR_environment=prod
```

### 3. Terraformの初期化
```bash
# terraformディレクトリに移動
cd terraform/

# バックエンドとプロバイダーの初期化
terraform init
```

成功時の出力例：
```
Terraform has been successfully initialized!
```

### 4. 構築計画の確認
```bash
# 開発環境の場合
terraform plan -var-file="environments/dev/terraform.tfvars"

# 本番環境の場合
terraform plan -var-file="environments/prod/terraform.tfvars"
```

以下の点を確認：
- 作成されるリソースの数
- 変更されるリソースの数
- 削除されるリソースの数
- エラーが発生していないこと

### 5. インフラの構築
```bash
# 開発環境の場合
terraform apply -var-file="environments/dev/terraform.tfvars"

# 本番環境の場合
terraform apply -var-file="environments/prod/terraform.tfvars"
```

実行前の確認：
1. `Enter a value:` と表示されたら、計画内容を再度確認
2. 問題なければ `yes` を入力してEnter

構築完了の目安時間：
- Aurora PostgreSQL: 約10-15分
- その他リソース: 約5分

### 6. 構築結果の確認
```bash
# 作成されたリソースの出力値を確認
terraform output
```

出力される主な情報：
- S3バケット名
- Lambda関数ARN
- Step Functions ARN
- Aurora エンドポイント
- DynamoDBテーブル名

### 7. 構築確認チェックリスト

#### Terraformで構築されるリソース
AWSマネジメントコンソールで以下を確認：

**ネットワーク関連**
- [ ] VPC が作成されている（csv-batch-vpc-dev）
- [ ] パブリックサブネット が作成されている（NAT Gateway用）
- [ ] プライベートサブネット が作成されている（2つ：AZ-1a, AZ-1c）
- [ ] セキュリティグループ が作成されている（Lambda用、Aurora用、VPCエンドポイント用）
- [ ] NAT Gateway が作成されている
- [ ] VPCエンドポイント が作成されている（S3、DynamoDB用）

**データストア関連**
- [ ] Aurora PostgreSQLクラスター が起動している（csv-parallel-processing-aurora-dev）
- [ ] Aurora インスタンス が起動している（Serverless v2）
- [ ] DynamoDBテーブル が作成されている（以下4つ）
  - [ ] audit-logs テーブル
  - [ ] processing-metadata テーブル
  - [ ] batch-jobs テーブル
  - [ ] job-locks テーブル
- [ ] S3バケット が作成されている（csv-processing-{account-id}-dev）

**監視・ログ関連**
- [ ] CloudWatchロググループ が作成されている（以下5つ）
  - [ ] /aws/lambda/csv-processor-dev
  - [ ] /aws/stepfunctions/csv-processing-dev
  - [ ] /csv-processing/application-dev
  - [ ] /csv-processing/system-dev
  - [ ] /aws/rds/cluster/csv-parallel-processing-aurora-dev/postgresql

**セキュリティ関連**
- [ ] IAMロール が作成されている（Lambda実行用、Step Functions実行用）
- [ ] IAMポリシー がアタッチされている

#### SAMで構築されるリソース（別途実施）
**注意**: 以下はTerraformでは構築されません。SAMで別途デプロイが必要です。

- [ ] Lambda関数の実装がデプロイされている
- [ ] Step Functionsステートマシンが作成されている
- [ ] API Gatewayが設定されている（必要な場合）

## トラブルシューティング

### terraform initでエラーが発生する場合
```bash
# キャッシュをクリアして再実行
rm -rf .terraform
rm -f .terraform.lock.hcl
terraform init
```

### terraform planでエラーが発生する場合
- AWS認証情報を確認
```bash
aws sts get-caller-identity
```
- IAM権限が不足していないか確認
- terraform.tfvarsファイルの設定値を確認

### terraform applyが途中で失敗した場合
```bash
# 再度applyを実行（Terraformは冪等性があるため安全）
terraform apply -var-file="environments/<env>/terraform.tfvars"
```

## インフラの削除手順（必要時のみ）

**注意**: 以下のコマンドはすべてのリソースを削除します。本番環境では十分注意して実行してください。

```bash
# 削除計画の確認
terraform plan -destroy -var-file="environments/<env>/terraform.tfvars"

# リソースの削除
terraform destroy -var-file="environments/<env>/terraform.tfvars"
```

削除時の注意点：
- S3バケット内にオブジェクトがある場合は事前に削除が必要
- Aurora スナップショットを残すか確認
- CloudWatchログは自動削除されない場合がある

## 参考情報
- Terraform公式ドキュメント: https://www.terraform.io/docs/
- AWS Provider: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- プロジェクト設計書: `/docs/01_Document/`配下の各種設計書を参照