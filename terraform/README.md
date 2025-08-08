# CSV並列処理システム - Terraformインフラ構成

## 概要

CSV並列処理システムのAWSインフラストラクチャをTerraformで管理します。

## ディレクトリ構造

```
terraform/
├── main.tf                 # メイン設定（Provider、Backend）
├── variables.tf            # 変数定義
├── outputs.tf              # 出力値定義
├── modules.tf              # モジュール呼び出し
├── environments/           # 環境別設定
│   ├── dev/
│   │   └── terraform.tfvars
│   └── prod/
│       └── terraform.tfvars
└── modules/                # カスタムモジュール
    ├── network/            # VPC、Subnet、SecurityGroup
    ├── iam/                # IAMロール、ポリシー
    ├── s3/                 # S3バケット設定
    ├── dynamodb/           # DynamoDBテーブル
    ├── lambda/             # Lambda関数
    ├── stepfunctions/      # Step Functions
    └── cloudwatch/         # CloudWatch Logs、メトリクス
```

## 使用方法

### 1. 初期化

```bash
cd terraform
terraform init
```

### 2. 開発環境デプロイ

```bash
terraform workspace select dev || terraform workspace new dev
terraform plan -var-file="environments/dev/terraform.tfvars"
terraform apply -var-file="environments/dev/terraform.tfvars"
```

### 3. 本番環境デプロイ

```bash
terraform workspace select prod || terraform workspace new prod
terraform plan -var-file="environments/prod/terraform.tfvars"
terraform apply -var-file="environments/prod/terraform.tfvars"
```

## 前提条件

### AWS認証情報

以下のいずれかの方法でAWS認証情報を設定：

```bash
# AWS CLIプロファイル使用
export AWS_PROFILE=default

# 環境変数設定
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=ap-northeast-1
```

### Terraform State Backend

事前に以下のリソースが必要：

- **S3バケット**: `naka-enginner-tfstate`
- **DynamoDBテーブル**: `terraform-state-lock`

### 必要な権限

Terraform実行用IAMユーザー/ロールに以下の権限が必要：

- AdministratorAccess (または同等の権限)
- 各AWSサービスへのフルアクセス権限

## モジュール構成

### Network Module
- VPC (10.0.1.0/24)
- パブリックサブネット (10.0.1.0/27)
- プライベートサブネット (10.0.1.32/27)
- セキュリティグループ (Lambda用、Aurora用)

### IAM Module
- Lambda実行ロール
- Step Functions実行ロール
- 最小権限の原則に基づく権限設定

### S3 Module
- 統合バケット (`csv-processing-{account-id}`)
- ライフサイクルポリシー (30日保存)
- イベント通知設定

### DynamoDB Module
- 監査ログテーブル (`csv_audit_logs`)
- TTL設定による自動削除

### Lambda Module
- CSV処理統合関数
- VPC接続設定
- 環境変数設定

### Step Functions Module
- CSV並列処理ワークフロー
- 分散マップ設定
- エラーハンドリング設定

### CloudWatch Module
- ログ記録設定
- メトリクス・アラーム設定

## 環境設定

### 開発環境 (dev)
- ログレベル: ALL
- メモリサイズ: 512MB
- ログ保存期間: 30日

### 本番環境 (prod)
- ログレベル: ERROR
- メモリサイズ: 1024MB
- ログ保存期間: 90日

## セキュリティ設定

- すべてのリソースに適切なタグ付け
- S3バケットのパブリックアクセス完全ブロック
- IAMロールの最小権限設定
- VPCによるネットワーク分離
- 暗号化設定（S3: SSE-S3、DynamoDB: 保存時暗号化）

## 監視・ログ

- CloudWatch Logsによる一元ログ管理
- カスタムメトリクスによる詳細監視
- CloudWatchアラームによる異常検知
- X-Rayによる分散トレーシング

## コスト最適化

- Lambda: 実行時間課金
- Step Functions: 状態遷移課金
- DynamoDB: Pay-per-request課金
- S3: ライフサイクルポリシーによるコスト削減

## トラブルシューティング

### よくある問題

1. **terraform init失敗**
   - S3バケット、DynamoDBテーブルの存在確認
   - AWS認証情報の確認

2. **terraform apply失敗**
   - IAM権限の確認
   - リソース制限の確認

3. **モジュール依存関係エラー**
   - モジュール間の依存関係順序確認
   - 出力値の参照設定確認

## 参考情報

- [Terraform AWS Provider Documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- プロジェクト設計書: `../docs/01_Document/`