# AWS SAMとTerraformの併用構成検討

## 1. 検討背景

CSVファイル並列処理システムの構築において、以下の構成を検討します：
- **Lambda関数の構築**: AWS SAM（Serverless Application Model）を利用
- **その他のAWSリソース**: Terraformを利用

## 2. AWS SAM概要

### 2.1 AWS SAMとは
AWS SAM（Serverless Application Model）は、サーバーレスアプリケーションを構築するためのオープンソースフレームワークです。CloudFormationの拡張として動作し、サーバーレスリソースの定義を簡潔に記述できます。

### 2.2 主な特徴
- **簡潔な記述**: Lambda関数、API Gateway、DynamoDBなどを短い記述で定義
- **ローカルテスト**: SAM CLIによるローカル環境でのLambda関数テスト
- **デプロイメント**: CloudFormation経由での安全なデプロイ
- **統合開発**: IDE統合、デバッグサポート
- **ベストプラクティス**: AWSのサーバーレスベストプラクティスを内包

### 2.3 メリット
- **開発効率**: Lambda関数の開発・テスト・デプロイが効率的
- **ローカル開発**: Docker経由でローカル環境での動作確認が可能
- **自動設定**: IAMロール、ログ設定などの自動生成
- **イベントソース統合**: S3、DynamoDB、EventBridgeなどとの簡単な統合
- **CI/CD対応**: CodePipeline、GitHub Actionsとの連携が容易

### 2.4 デメリット
- **AWS専用**: 他のクラウドプロバイダーでは使用不可
- **CloudFormation制限**: 内部的にCloudFormationを使用するため、その制限を受ける
- **学習曲線**: SAM固有の構文とコンセプトを学ぶ必要がある
- **状態管理**: Terraformのような詳細な状態管理機能はない

## 3. 現在のシステム構成分析

### 3.1 Lambda関数一覧
現在の設計書から、以下のLambda関数が必要です：
1. **csv-validator**: CSV検証関数
2. **csv-chunk-processor**: チャンク処理関数（ユーザーログ処理）
3. **csv-audit-logger**: 監査ログ記録関数
4. **csv-result-aggregator**: 結果集約関数
5. **csv-error-handler**: エラーハンドリング関数

### 3.2 Lambda関数の特徴
- **ランタイム**: TypeScript/Node.js 22.x
- **アーキテクチャ**: arm64（Graviton2）
- **VPC接続**: Aurora接続のため必要
- **環境変数**: 多数の設定値が必要
- **IAMロール**: 細かい権限設定が必要

### 3.3 その他のAWSリソース
- **VPC/Subnet/Security Group**: ネットワーク構成
- **Aurora Serverless v2**: データベース
- **DynamoDB**: 監査ログテーブル
- **S3バケット**: 入出力ファイル管理
- **EventBridge**: S3イベント処理
- **Step Functions**: ワークフロー管理
- **IAMロール/ポリシー**: 権限管理
- **KMS**: 暗号化キー
- **Secrets Manager**: 認証情報管理

## 4. SAMとTerraformの併用パターン

### 4.1 推奨構成案

#### 4.1.1 責任分担
```yaml
AWS SAM管理:
  - Lambda関数のコード
  - Lambda関数の基本設定（メモリ、タイムアウト、環境変数）
  - Lambda関数のイベントソースマッピング（基本的なもの）
  - Lambda Layer（共通ライブラリ）

Terraform管理:
  - VPC、Subnet、Security Group
  - Aurora Serverless v2
  - DynamoDB
  - S3バケット、バケットポリシー
  - EventBridge
  - Step Functions
  - IAMロール、ポリシー（Lambda用含む）
  - KMS暗号化キー
  - Secrets Manager
  - CloudWatch Logs、メトリクス設定
```

#### 4.1.2 実装アプローチ
1. **Phase 1**: Terraformで基盤インフラを構築
   - ネットワーク（VPC、Subnet、Security Group）
   - データストア（Aurora、DynamoDB、S3）
   - セキュリティ（IAM、KMS、Secrets Manager）

2. **Phase 2**: TerraformでLambda用IAMロールを作成
   - 各Lambda関数用のIAMロール
   - 必要な権限ポリシーのアタッチ

3. **Phase 3**: SAMでLambda関数をデプロイ
   - Lambda関数コード
   - 環境変数設定（Terraformの出力値を参照）
   - VPC設定（Terraformで作成したリソースを参照）

4. **Phase 4**: TerraformでStep Functionsを構築
   - SAMでデプロイしたLambda関数のARNを参照
   - ワークフロー定義

### 4.2 ディレクトリ構成案（改善版）
```
csv-parallel-processing/
├── terraform/                    # Terraformコード
│   ├── environments/
│   │   ├── dev/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── terraform.tfvars
│   │   └── prod/
│   │       ├── main.tf
│   │       ├── variables.tf
│   │       └── terraform.tfvars
│   ├── modules/
│   │   ├── network/             # VPC、Subnet、SG
│   │   ├── database/            # Aurora、DynamoDB
│   │   ├── storage/             # S3
│   │   ├── iam/                 # IAMロール、ポリシー
│   │   ├── security/            # KMS、Secrets Manager
│   │   └── orchestration/       # Step Functions、EventBridge
│   └── outputs.tf               # SAMで参照する値を出力
│
├── sam/                         # SAMコード
│   ├── template.yaml            # SAMテンプレート
│   ├── samconfig.toml          # SAM設定
│   ├── src/                    # Lambda関数ソースコード
│   │   ├── functions/          # Lambda関数（個別）
│   │   │   ├── csv-validator/
│   │   │   │   ├── index.ts    # エントリーポイント
│   │   │   │   ├── handler.ts  # Lambda handler
│   │   │   │   ├── service.ts  # ビジネスロジック
│   │   │   │   └── package.json # 関数固有の依存関係
│   │   │   ├── csv-chunk-processor/
│   │   │   │   ├── index.ts
│   │   │   │   ├── handler.ts
│   │   │   │   ├── service.ts
│   │   │   │   └── package.json
│   │   │   ├── csv-audit-logger/
│   │   │   │   ├── index.ts
│   │   │   │   ├── handler.ts
│   │   │   │   ├── service.ts
│   │   │   │   └── package.json
│   │   │   ├── csv-result-aggregator/
│   │   │   │   ├── index.ts
│   │   │   │   ├── handler.ts
│   │   │   │   ├── service.ts
│   │   │   │   └── package.json
│   │   │   └── csv-error-handler/
│   │   │       ├── index.ts
│   │   │       ├── handler.ts
│   │   │       ├── service.ts
│   │   │       └── package.json
│   │   ├── layers/             # Lambda Layers
│   │   │   ├── common-layer/   # 共通ライブラリレイヤー
│   │   │   │   ├── nodejs/
│   │   │   │   │   ├── node_modules/
│   │   │   │   │   └── package.json
│   │   │   │   └── layer.yaml  # Layer固有設定
│   │   │   ├── business-layer/ # ビジネスロジックレイヤー
│   │   │   │   ├── nodejs/
│   │   │   │   │   ├── lib/
│   │   │   │   │   │   ├── services/
│   │   │   │   │   │   ├── repositories/
│   │   │   │   │   │   └── models/
│   │   │   │   │   └── package.json
│   │   │   │   └── layer.yaml
│   │   │   └── infrastructure-layer/ # インフラレイヤー
│   │   │       ├── nodejs/
│   │   │       │   ├── lib/
│   │   │       │   │   ├── aws/
│   │   │       │   │   ├── config/
│   │   │       │   │   └── utils/
│   │   │       │   └── package.json
│   │   │       └── layer.yaml
│   │   └── shared/             # 共通コード（型定義など）
│   │       ├── types/          # 共通型定義
│   │       │   ├── aws.ts
│   │       │   ├── domain.ts
│   │       │   └── index.ts
│   │       ├── constants/      # 定数定義
│   │       │   ├── csv.ts
│   │       │   ├── aws.ts
│   │       │   └── index.ts
│   │       ├── schemas/        # バリデーションスキーマ
│   │       │   ├── csv.ts
│   │       │   ├── user.ts
│   │       │   └── index.ts
│   │       └── interfaces/     # インターフェース定義
│   │           ├── repositories.ts
│   │           ├── services.ts
│   │           └── index.ts
│   ├── tests/                  # テストコード
│   │   ├── unit/              # 単体テスト
│   │   │   ├── functions/
│   │   │   │   ├── csv-validator/
│   │   │   │   │   ├── handler.test.ts
│   │   │   │   │   └── service.test.ts
│   │   │   │   ├── csv-chunk-processor/
│   │   │   │   │   ├── handler.test.ts
│   │   │   │   │   └── service.test.ts
│   │   │   │   └── [other-functions]/
│   │   │   ├── layers/
│   │   │   │   ├── business-layer/
│   │   │   │   └── infrastructure-layer/
│   │   │   └── shared/
│   │   ├── integration/       # 統合テスト
│   │   │   ├── workflows/
│   │   │   └── end-to-end/
│   │   ├── fixtures/          # テストデータ
│   │   │   ├── csv/
│   │   │   ├── users/
│   │   │   └── events/
│   │   ├── mocks/             # モック定義
│   │   │   ├── aws-services.ts
│   │   │   ├── repositories.ts
│   │   │   └── external-apis.ts
│   │   └── helpers/           # テストヘルパー
│   │       ├── builders/
│   │       ├── setup.ts
│   │       └── utils.ts
│   ├── scripts/               # ビルド・デプロイスクリプト
│   │   ├── build-layers.sh
│   │   ├── build-functions.sh
│   │   ├── deploy-dev.sh
│   │   └── deploy-prod.sh
│   └── configs/               # 設定ファイル
│       ├── jest.config.js
│       ├── tsconfig.json
│       ├── .eslintrc.json
│       └── .prettierrc
│
├── scripts/                     # デプロイスクリプト
│   ├── deploy-infrastructure.sh # Terraformデプロイ
│   ├── deploy-lambda.sh        # SAMデプロイ
│   └── deploy-all.sh           # 全体デプロイ
│
└── docs/                        # ドキュメント
```

#### 4.2.1 構成の改善点

##### Lambda関数の構造化
各Lambda関数は以下の構造を持ちます：
```typescript
// functions/csv-validator/
├── index.ts      // エントリーポイント（エクスポート）
├── handler.ts    // Lambda handler（AWS固有処理）
├── service.ts    // ビジネスロジック
└── package.json  // 関数固有の依存関係
```

##### レイヤー戦略
- **common-layer**: AWS SDK、共通ユーティリティ
- **business-layer**: ドメインロジック、サービス層
- **infrastructure-layer**: AWS クライアント、設定管理

##### 拡張性の確保
- 新しいLambda関数の追加が容易
- 関数ごとの独立した依存関係管理
- レイヤーによるコード再利用
- テスト構造の統一

### 4.3 SAMテンプレート例
```yaml
# sam/template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: CSV Parallel Processing Lambda Functions

# Terraformからの出力値を参照
Parameters:
  VpcId:
    Type: String
    Description: VPC ID from Terraform
  PrivateSubnetIds:
    Type: CommaDelimitedList
    Description: Private Subnet IDs from Terraform
  LambdaSecurityGroupId:
    Type: String
    Description: Lambda Security Group ID from Terraform
  CsvValidatorRoleArn:
    Type: String
    Description: CSV Validator Lambda Role ARN from Terraform
  AuroraSecretArn:
    Type: String
    Description: Aurora Secret ARN from Terraform
  InputBucketName:
    Type: String
    Description: Input S3 Bucket Name from Terraform
  OutputBucketName:
    Type: String
    Description: Output S3 Bucket Name from Terraform
  DynamoDBTableName:
    Type: String
    Description: DynamoDB Table Name from Terraform

Globals:
  Function:
    Runtime: nodejs22.x
    Architectures:
      - arm64
    Timeout: 300
    MemorySize: 512
    Environment:
      Variables:
        NODE_ENV: production
        LOG_LEVEL: INFO

Resources:
  # 共通Layer
  CommonLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      LayerName: csv-processing-common
      ContentUri: src/layers/
      CompatibleRuntimes:
        - nodejs22.x
      CompatibleArchitectures:
        - arm64
    Metadata:
      BuildMethod: nodejs22.x
      BuildProperties:
        TargetPath: nodejs

  # CSV検証Lambda
  CsvValidatorFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: csv-validator
      CodeUri: src/handlers/csv-validator/
      Handler: index.handler
      Role: !Ref CsvValidatorRoleArn
      Layers:
        - !Ref CommonLayer
      VpcConfig:
        SecurityGroupIds:
          - !Ref LambdaSecurityGroupId
        SubnetIds: !Ref PrivateSubnetIds
      Environment:
        Variables:
          INPUT_BUCKET_NAME: !Ref InputBucketName
          DYNAMODB_TABLE_NAME: !Ref DynamoDBTableName
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: node22
        Sourcemap: true
        External:
          - "@aws-sdk/*"

  # チャンク処理Lambda
  ChunkProcessorFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: csv-chunk-processor
      CodeUri: src/handlers/csv-chunk-processor/
      Handler: index.handler
      Role: !GetAtt ChunkProcessorRole.Arn
      Layers:
        - !Ref CommonLayer
      VpcConfig:
        SecurityGroupIds:
          - !Ref LambdaSecurityGroupId
        SubnetIds: !Ref PrivateSubnetIds
      Environment:
        Variables:
          AURORA_SECRET_ARN: !Ref AuroraSecretArn
          DYNAMODB_TABLE_NAME: !Ref DynamoDBTableName
      ReservedConcurrentExecutions: 5  # 並列実行数制限
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: node22
        Sourcemap: true
        External:
          - "@aws-sdk/*"

  # 以下、他のLambda関数も同様に定義...
```

### 4.4 Terraformコード例
```hcl
# terraform/modules/iam/lambda_roles.tf
resource "aws_iam_role" "csv_validator_role" {
  name = "csv-lambda-validator-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "csv_validator_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.csv_validator_role.name
}

resource "aws_iam_policy" "csv_validator_policy" {
  name = "csv-validator-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = [
          "${aws_s3_bucket.input_bucket.arn}/incoming/*",
          "${aws_s3_bucket.input_bucket.arn}/processing/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem"
        ]
        Resource = aws_dynamodb_table.csv_logs.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "csv_validator_custom" {
  policy_arn = aws_iam_policy.csv_validator_policy.arn
  role       = aws_iam_role.csv_validator_role.name
}

# 出力値（SAMで参照）
output "csv_validator_role_arn" {
  value = aws_iam_role.csv_validator_role.arn
}
```

### 4.5 デプロイスクリプト例
```bash
#!/bin/bash
# scripts/deploy-all.sh

set -e

echo "=== Phase 1: Deploying Infrastructure with Terraform ==="
cd terraform/environments/prod
terraform init
terraform plan -out=tfplan
terraform apply tfplan

# Terraform出力値を取得
VPC_ID=$(terraform output -raw vpc_id)
PRIVATE_SUBNET_IDS=$(terraform output -json private_subnet_ids | jq -r '. | join(",")')
LAMBDA_SG_ID=$(terraform output -raw lambda_security_group_id)
CSV_VALIDATOR_ROLE_ARN=$(terraform output -raw csv_validator_role_arn)
AURORA_SECRET_ARN=$(terraform output -raw aurora_secret_arn)
INPUT_BUCKET_NAME=$(terraform output -raw input_bucket_name)
OUTPUT_BUCKET_NAME=$(terraform output -raw output_bucket_name)
DYNAMODB_TABLE_NAME=$(terraform output -raw dynamodb_table_name)

cd ../../../

echo "=== Phase 2: Deploying Lambda Functions with SAM ==="
cd sam

# SAMパラメータを設定
cat > deploy-params.txt <<EOF
VpcId=$VPC_ID
PrivateSubnetIds=$PRIVATE_SUBNET_IDS
LambdaSecurityGroupId=$LAMBDA_SG_ID
CsvValidatorRoleArn=$CSV_VALIDATOR_ROLE_ARN
AuroraSecretArn=$AURORA_SECRET_ARN
InputBucketName=$INPUT_BUCKET_NAME
OutputBucketName=$OUTPUT_BUCKET_NAME
DynamoDBTableName=$DYNAMODB_TABLE_NAME
EOF

# SAMビルドとデプロイ
sam build
sam deploy \
  --stack-name csv-processing-lambda \
  --parameter-overrides $(cat deploy-params.txt) \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset

# Lambda関数のARNを取得
CSV_VALIDATOR_ARN=$(aws cloudformation describe-stacks \
  --stack-name csv-processing-lambda \
  --query "Stacks[0].Outputs[?OutputKey=='CsvValidatorFunctionArn'].OutputValue" \
  --output text)

cd ..

echo "=== Phase 3: Updating Step Functions with Lambda ARNs ==="
cd terraform/environments/prod

# Lambda ARNsをTerraform変数として設定
terraform apply -var="csv_validator_lambda_arn=$CSV_VALIDATOR_ARN" -auto-approve

echo "=== Deployment Complete ==="
```

## 5. メリット・デメリット分析

### 5.1 SAM + Terraform併用のメリット

#### 5.1.1 開発効率の向上
- **Lambda開発に特化**: SAMの豊富なLambda開発機能を活用
- **ローカルテスト**: SAM CLIによるローカル環境でのテストが容易
- **ホットリロード**: コード変更時の迅速な反映
- **デバッグ支援**: IDE統合によるブレークポイントデバッグ

#### 5.1.2 インフラ管理の最適化
- **適材適所**: 各ツールの得意分野を活かした構成
- **Terraform の強み**: 複雑なインフラリソースの管理に優れる
- **SAMの強み**: サーバーレスアプリケーションの開発に特化

#### 5.1.3 運用の柔軟性
- **独立したライフサイクル**: インフラとアプリケーションを独立して管理
- **段階的なデプロイ**: インフラ変更とコード変更を分離
- **チーム分担**: インフラチームとアプリチームの責任分界点が明確

### 5.2 SAM + Terraform併用のデメリット

#### 5.2.1 複雑性の増加
- **ツール学習**: 2つのツールを習得する必要
- **依存関係管理**: TerraformとSAM間の依存関係を手動管理
- **デプロイ順序**: 正しい順序でのデプロイが必要

#### 5.2.2 運用オーバーヘッド
- **状態管理**: Terraformのtfstateとcloudformationスタックの2重管理
- **パラメータ受け渡し**: Terraform出力値をSAMパラメータに手動設定
- **統合テスト**: 2つのツールで作成したリソースの統合テストが複雑

#### 5.2.3 トラブルシューティング
- **エラー解析**: 問題発生時の原因特定が複雑
- **ロールバック**: 部分的なロールバックの実装が困難

## 6. 実装可能性評価

### 6.1 技術的実現性
- **実現可能**: 多くのプロジェクトで採用実績あり
- **パターン確立**: ベストプラクティスが存在
- **ツール対応**: 両ツールとも相互運用を想定した機能あり

### 6.2 現在の設計との整合性
- **Lambda設計**: TypeScript実装はSAMで完全サポート
- **インフラ設計**: 複雑な権限設定はTerraformが適している
- **Step Functions**: Terraformでの管理が適切（Lambda ARN参照可能）

### 6.3 推奨事項
1. **採用推奨**: SAM + Terraform併用構成を推奨
2. **段階的移行**: まずTerraformでインフラ構築、その後SAMでLambda実装
3. **自動化**: デプロイスクリプトによる手順の自動化必須
4. **ドキュメント**: 依存関係と手順の詳細なドキュメント化

## 7. 代替案の検討

### 7.1 Terraform単独構成
```yaml
メリット:
  - 単一ツールでの管理
  - 状態管理の一元化
  - 依存関係の自動解決

デメリット:
  - Lambda開発機能の不足
  - ローカルテストの困難さ
  - デプロイパッケージ作成の複雑さ
```

### 7.2 CloudFormation/SAM単独構成
```yaml
メリット:
  - AWS公式ツールの統一
  - CloudFormationスタックの一元管理
  - SAMの全機能活用

デメリット:
  - 複雑なインフラ定義の冗長性
  - Terraformと比較してコミュニティリソースが少ない
  - マルチクラウド対応不可
```

### 7.3 AWS CDK構成
```yaml
メリット:
  - TypeScriptでインフラもコード化
  - 型安全性
  - 高い抽象化

デメリット:
  - 学習曲線が急
  - デバッグの複雑さ
  - CloudFormation制限の継承
```

## 8. 結論と推奨アーキテクチャ

### 8.1 推奨構成
**SAM（Lambda関数）+ Terraform（その他のインフラ）の併用**を推奨します。

### 8.2 理由
1. **開発効率**: SAMによるLambda開発の効率化
2. **インフラ管理**: Terraformによる柔軟なインフラ管理
3. **保守性**: 明確な責任分界による保守性向上
4. **実績**: 多数の採用実績とベストプラクティス

### 8.3 実装ロードマップ
```
Phase 1 (Week 1-2):
  - Terraform基盤構築
  - ネットワーク、データベース、S3、IAM

Phase 2 (Week 3-4):
  - SAM環境構築
  - Lambda関数実装
  - ローカルテスト環境整備

Phase 3 (Week 5):
  - Step Functions実装（Terraform）
  - 統合テスト
  - デプロイ自動化

Phase 4 (Week 6):
  - 本番環境構築
  - 運用ドキュメント作成
  - 監視設定
```

この構成により、効率的な開発と堅牢なインフラ管理を両立させた、保守性の高いシステムを構築できます。