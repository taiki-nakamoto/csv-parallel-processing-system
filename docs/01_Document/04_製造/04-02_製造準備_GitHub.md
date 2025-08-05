# 製造準備_GitHub

## 1. ドキュメント情報

| 項目 | 内容 |
|------|------|
| ドキュメント名 | 製造準備_GitHub |
| バージョン | 1.0 |
| 作成日 | 2025-08-04 |
| 作成者 | システム開発チーム |
| 更新日 | 2025-08-04 |
| 参照ドキュメント | 03_Research/20250804_09_GitHub環境準備作業計画.md |

## 2. GitHub環境準備概要

CSVファイル並列処理システムのGitHub環境準備について、以下の項目を実施します：

### 2.1 対象GitHubアカウント
- **GitHubアカウント**: taiki-nakamoto
- **アカウントURL**: https://github.com/taiki-nakamoto?tab=repositories
- **アクセス権限**: 個人アカウント（フル権限）

### 2.2 準備対象項目
1. ✅ 作業計画策定（参照：03_Research/20250804_09_GitHub環境準備作業計画.md）
2. ⏳ GitHubリポジトリ作成
3. ⏳ ブランチ戦略実装
4. ⏳ GitHub Actions Secrets設定
5. ⏳ 初期プロジェクト構成作成

## 3. GitHubリポジトリ設定

### 3.1 リポジトリ基本設定 ⏳未実施

| 項目 | 設定内容 | 理由 |
|------|----------|------|
| **リポジトリ名** | csv-parallel-processing-system | プロジェクト識別名 |
| **アクセス** | Private | ビジネスロジック保護 |
| **初期化** | README.md, .gitignore作成 | 基本ファイル準備 |
| **説明** | CSVファイル並列処理システム - AWS Lambda + Step Functions | プロジェクト概要 |

### 3.2 リポジトリ作成手順

#### Web画面での作業
1. **GitHubアクセス**
   - https://github.com/taiki-nakamoto にアクセス
   - 「New repository」ボタンをクリック

2. **基本情報入力**
   ```
   Repository name: csv-parallel-processing-system
   Description: CSVファイル並列処理システム - AWS Lambda + Step Functions
   Visibility: ✓ Private
   Initialize: ✓ Add a README file
              ✓ Add .gitignore (Node template)
   ```

3. **リポジトリ作成**
   - 「Create repository」ボタンをクリック

#### ローカル環境接続
```bash
# Git設定確認
git config --global user.name
git config --global user.email

# プロジェクトディレクトリ作成・クローン
mkdir csv-parallel-processing-system
cd csv-parallel-processing-system
git clone https://github.com/taiki-nakamoto/csv-parallel-processing-system.git .

# 初期状態確認
git status
git remote -v
```

## 4. ブランチ戦略・保護設定

### 4.1 ブランチ戦略 ⏳未実施

#### GitFlow戦略採用
```
main      ← 本番リリース用（厳格保護）
develop   ← 開発統合用（基本保護）
feature/* ← 機能開発用（一時的）
hotfix/*  ← 緊急修正用（一時的）
```

### 4.2 ブランチ保護ルール設定

#### mainブランチ保護設定
- ✅ Require a pull request before merging
- ✅ Require approvals (1名以上)
- ✅ Dismiss stale reviews when new commits are pushed
- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date before merging
- ✅ Require linear history
- ✅ Include administrators

#### developブランチ保護設定
- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date before merging
- ❌ Require approvals（開発効率のため）

### 4.3 ブランチ保護設定手順

1. **Settings > Branches に移動**
2. **mainブランチ保護ルール追加**
   - Branch name pattern: `main`
   - 上記mainブランチ保護設定を適用
3. **developブランチ保護ルール追加**
   - Branch name pattern: `develop`
   - 上記developブランチ保護設定を適用

## 5. GitHub Actions Secrets設定

### 5.1 設定対象Secrets ⏳未実施

#### AWS関連Secrets
| Secret名 | 設定値 | 用途 | 状態 |
|----------|--------|------|------|
| `AWS_ACCESS_KEY_ID` | （実際のアクセスキー） | AWS認証 | ⏳未設定 |
| `AWS_SECRET_ACCESS_KEY` | （実際のシークレットキー） | AWS認証 | ⏳未設定 |
| `AWS_REGION` | ap-northeast-1 | AWSリージョン | ⏳未設定 |
| `S3_TFSTATE_BUCKET` | naka-enginner-tfstate | Terraform State保存先 | ⏳未設定 |
| `S3_SAM_ARTIFACTS_BUCKET` | naka-sam-artifacts | SAM Artifacts保存先 | ⏳未設定 |

### 5.2 Secrets設定手順

1. **Settings > Secrets and variables > Actions に移動**
2. **各Secretを個別追加**
   ```
   New repository secret をクリック
   Name: AWS_ACCESS_KEY_ID
   Secret: （dev-terrarom-nakaのアクセスキー）
   Add secret をクリック
   
   以下、他のSecretsも同様に追加
   ```

### 5.3 環境分離設定（将来実装）

#### Environments設定
```
Development Environment:
  - 環境名: development
  - Deployment branches: develop, feature/*
  
Production Environment:
  - 環境名: production  
  - Deployment branches: main
  - Required reviewers: 設定予定
```

## 5.4. GitHubとClaude Codeの連携方法 ⏳未実施

### 5.4.1 Claude Codeでのリポジトリ接続

#### 接続手順
1. **Claude Codeでリポジトリを開く**
   ```bash
   # リポジトリクローン
   git clone https://github.com/taiki-nakamoto/csv-parallel-processing-system.git
   cd csv-parallel-processing-system
   
   # Claude Codeで開く
   code .
   ```

2. **Claude Code内でGit操作**
   - Claude Codeは既存のローカルGit設定を自動認識
   - コミット、プッシュ、プルリクエスト作成が可能
   - GitHub統合により直接連携動作

#### Claude CodeでのGit操作例
```bash
# ブランチ作成・切り替え
git checkout -b feature/csv-validation

# ファイル編集後のコミット
git add .
git commit -m "CSV検証機能実装

- CSVファイル形式チェック機能追加
- バリデーションルール実装
- エラーハンドリング追加
"

# リモートへプッシュ
git push origin feature/csv-validation
```

### 5.4.2 Claude Code特有の機能活用

#### プロジェクト管理機能
- **CLAUDE.md**: プロジェクト固有の指示・ルールを記載
- **ファイル検索**: 大規模プロジェクトでの効率的なファイル検索
- **コード理解**: 既存コードベースの構造理解・説明

#### 開発効率化
- **自動コード生成**: 設計書に基づくコード自動生成
- **テストコード作成**: 実装に対応するテストコード自動生成
- **ドキュメント更新**: コード変更に伴うドキュメント自動更新

#### CI/CD連携
- **GitHub Actions**: ワークフロー作成・修正
- **エラー解析**: CI/CDエラーの原因分析・修正提案
- **デプロイ支援**: AWS環境へのデプロイ支援

### 5.4.3 CLAUDE.mdファイル作成

プロジェクトルートに`CLAUDE.md`を作成し、Claude Code固有の指示を記載：

```markdown
# CLAUDE.md

このファイルはClaude Code用のプロジェクト設定・指示ファイルです。

## プロジェクト概要
CSVファイル並列処理システム - AWS Lambda + Step Functions

## ディレクトリ構造
- `terraform/`: インフラ定義（Terraform）
- `sam/`: Lambda関数（TypeScript）
- `docs/`: プロジェクトドキュメント
  - `01_Document/`: 設計書・要件定義
  - `02_Tasks/`: タスク管理
  - `03_Research/`: 技術調査
  - `10_Manual/`: 運用手順書
  - `99_old/`: アーカイブ
- `local-env/`: ローカル開発環境

## コーディング規約
- TypeScript strict mode使用
- ESLint + Prettier適用
- DDD（ドメイン駆動設計）アーキテクチャ
- 単体テスト必須（Jest使用）

## デプロイ方針
- 開発環境: developブランチ → 自動デプロイ
- 本番環境: mainブランチ → 手動承認後デプロイ

## 重要な参照ドキュメント
- `docs/01_Document/`: 設計書・要件定義
  - `04-01_製造準備_AWS環境.md`: AWS環境設定
  - `04-02_製造準備_GitHub.md`: GitHub環境設定
- `docs/02_Tasks/`: タスク管理・進捗
  - `20250804_01_製造タスク管理.md`: 全体進捗管理
- `docs/03_Research/`: 技術調査・検証
  - `20250804_09_GitHub環境準備作業計画.md`: GitHub準備詳細
```

### 5.4.4 連携時の注意事項

#### セキュリティ
- **認証情報**: GitHub Personal Access Token等はClaude Codeに直接入力しない
- **Secrets管理**: 機密情報はGitHub Secretsで管理
- **ローカル認証**: Git認証はローカル環境で事前設定

#### 効率的な作業フロー
1. **タスク管理**: GitHub Issuesとの連携活用
2. **コードレビュー**: プルリクエストでのレビュー必須
3. **ドキュメント更新**: コード変更時のドキュメント同期更新

## 6. 初期プロジェクト構成

### 6.1 ディレクトリ構成設計（devcontainer対応版） ✅実施済み

```
csv-parallel-processing-system/
├── .devcontainer/           # VS Code Dev Container設定
│   ├── devcontainer.json    # Dev Container設定
│   ├── docker-compose.yml   # 開発環境サービス構成
│   ├── Dockerfile           # 開発コンテナイメージ
│   └── setup-scripts/       # セットアップスクリプト
│       ├── install-aws-cli.sh
│       ├── install-sam-cli.sh
│       ├── setup-minio.sh
│       └── setup-postgres.sh
├── .github/workflows/        # CI/CD定義
│   ├── pr-check.yml         # プルリクエストチェック
│   ├── dev-deploy.yml       # 開発環境デプロイ
│   └── prod-deploy.yml      # 本番環境デプロイ
├── terraform/                # インフラ定義
│   ├── environments/
│   │   ├── dev/
│   │   └── prod/
│   └── modules/
│       ├── network/
│       ├── aurora/
│       ├── s3/
│       └── iam/
├── sam/                       # Lambda関数（TypeScript）
│   ├── src/
│   │   ├── controllers/     # プレゼンテーション層
│   │   ├── application/     # アプリケーション層
│   │   ├── domain/          # ドメイン層
│   │   └── infrastructure/  # インフラストラクチャ層
│   ├── layers/              # Lambda Layers
│   ├── tests/               # テストコード
│   ├── template.yaml        # SAMテンプレート
│   ├── samconfig.toml       # SAM設定
│   └── package.json         # Node.js依存関係
├── local-env/                # ローカル開発環境（devcontainer用）
│   ├── minio/               # MinIO（S3代替）
│   │   ├── data/           # データ永続化
│   │   └── config/         # 設定ファイル
│   ├── postgres/            # PostgreSQL（Aurora代替）
│   │   ├── data/           # データ永続化
│   │   ├── initdb/         # 初期化SQLスクリプト
│   │   └── config/         # 設定ファイル
│   ├── pgadmin/            # pgAdmin 4設定永続化
│   └── dynamodb/           # DynamoDB Local
│       └── data/           # データ永続化
├── docs/                     # プロジェクトドキュメント
│   ├── 01_Document/         # 設計書・要件定義
│   │   ├── 01-01_要件定義書_CSVファイル並列処理システム.md
│   │   ├── 02-01_基本設計書_Lambda開発標準仕様書.md
│   │   ├── 03-01_詳細設計書_インフラ詳細設計.md
│   │   ├── 04-01_製造準備_AWS環境.md
│   │   ├── 04-02_製造準備_GitHub.md
│   │   └── ...（その他設計書）
│   ├── 02_Tasks/            # タスク管理・進捗管理
│   │   ├── 20250802_01_プロジェクトの設計管理.md
│   │   ├── 20250804_01_製造タスク管理.md
│   │   └── ...（その他タスク管理）
│   ├── 03_Research/         # 技術調査・検証結果
│   │   ├── 20250802_01_Mermaid概要と使い方.md
│   │   ├── 20250804_09_GitHub環境準備作業計画.md
│   │   └── ...（その他調査結果）
│   ├── 10_Manual/           # 運用手順書
│   │   └── （将来作成予定）
│   └── 99_old/              # 過去ドキュメント
│       └── （アーカイブ用）
├── scripts/                  # 各種スクリプト
│   ├── deploy.sh            # デプロイスクリプト
│   ├── setup-local.sh       # ローカル環境セットアップ
│   └── test.sh              # テスト実行スクリプト
├── .gitignore               # Git除外設定
├── README.md                # プロジェクト概要
├── CLAUDE.md                # Claude Code用設定
└── package.json             # プロジェクト依存関係
```

#### 技術スタック（TypeScript/Node.js中心）
- **Lambda関数**: TypeScript実装
- **AWS SDK**: `@aws-sdk/client-*` (JavaScript/TypeScript)  
- **テストフレームワーク**: Jest + TypeScript
- **コード品質**: ESLint + Prettier + TypeScript compiler
- **インフラ管理**: Terraform + AWS CLI
- **ローカル開発**: VS Code Dev Containers

#### 開発環境サービス（devcontainer）
- **MinIO**: S3代替（ポート5000/6001）
- **PostgreSQL**: Aurora代替（ポート5432）
- **pgAdmin 4**: PostgreSQL管理画面（ポート8080）
- **DynamoDB Local**: DynamoDB代替（ポート4500）
- **SAM Local**: Lambda開発・テスト（ポート4000/4001）
- **EventBridge**: 開発環境では省略（直接呼び出し）

**⚠️ 重要**: Python環境は使用しません。全てTypeScript/Node.js環境で統一します。

### 6.2 初期ファイル作成手順

#### 1. developブランチ作成・切り替え
```bash
git checkout -b develop
```

#### 2. ディレクトリ構成作成
```bash
# 基本ディレクトリ作成
mkdir -p .github/workflows
mkdir -p terraform/environments/{dev,prod}
mkdir -p terraform/modules/{network,aurora,s3,iam}
mkdir -p sam/{src/{controllers,application,domain,infrastructure},layers,tests}
mkdir -p local-env/{local-s3,postgresql,dynamodb-local,scripts}
mkdir -p docs/{01_Document,02_Tasks,03_Research,10_Manual,99_old}
mkdir -p scripts
```

#### 3. README.md更新
```markdown
# CSVファイル並列処理システム

AWS Lambda + Step Functionsを使用したCSVファイル並列処理システム

## アーキテクチャ概要

- **CSV検証**: アップロードされたCSVファイルの妥当性チェック
- **並列処理**: Step Functions分散マップによる大容量CSV並列処理  
- **監査ログ**: DynamoDBによる処理履歴管理
- **データ保存**: Aurora PostgreSQLによるデータ永続化

## 技術スタック

- **インフラ**: AWS (Lambda, Step Functions, S3, DynamoDB, Aurora)
- **IaC**: Terraform + AWS SAM
- **言語**: TypeScript (Node.js 18.x)
- **CI/CD**: GitHub Actions
- **ローカル開発**: SAM CLI + PostgreSQL + DynamoDB Local

## 開発環境セットアップ

```bash
# リポジトリクローン
git clone https://github.com/taiki-nakamoto/csv-parallel-processing-system.git
cd csv-parallel-processing-system

# ローカル環境セットアップ
./scripts/setup-local.sh
```

## デプロイ

```bash
# 開発環境デプロイ  
./scripts/deploy.sh dev

# 本番環境デプロイ
./scripts/deploy.sh prod
```
```

#### 4. .gitignore更新
```gitignore
# Project specific
local-env/postgresql/data/
local-env/dynamodb-local/data/
*.tfstate
*.tfstate.backup
.terraform/
.terraform.lock.hcl

# SAM
.aws-sam/
samconfig.toml

# Environment variables
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db
```

#### 5. 初期コミット・プッシュ
```bash
git add .
git commit -m "初期プロジェクト構成作成

- ディレクトリ構成作成
- README.md更新
- .gitignore更新
"
git push origin develop
```

## 7. GitHub Actions基本ワークフロー

### 7.1 プルリクエストチェック ⏳未実施

#### .github/workflows/pr-check.yml
```yaml
name: Pull Request Check

on:
  pull_request:
    branches: [ main, develop ]

jobs:
  terraform-check:
    name: Terraform Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v2
        
      - name: Terraform Format Check
        run: terraform fmt -check -recursive terraform/
        
      - name: Terraform Validate
        run: |
          cd terraform/environments/dev
          terraform init -backend=false
          terraform validate

  sam-check:
    name: SAM Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          
      - name: Install dependencies
        run: |
          cd sam
          npm install
          
      - name: Run tests
        run: |
          cd sam
          npm run test
          
      - name: SAM Build
        run: |
          cd sam
          sam build
```

### 7.2 開発環境デプロイ ⏳未実施

#### .github/workflows/dev-deploy.yml
```yaml
name: Deploy to Development

on:
  push:
    branches: [ develop ]

env:
  AWS_REGION: ${{ secrets.AWS_REGION }}

jobs:
  deploy-infrastructure:
    name: Deploy Infrastructure
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}
          
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v2
        
      - name: Terraform Apply
        run: |
          cd terraform/environments/dev
          terraform init
          terraform plan
          terraform apply -auto-approve

  deploy-lambda:
    name: Deploy Lambda Functions
    needs: deploy-infrastructure
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}
          
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          
      - name: SAM Deploy
        run: |
          cd sam
          sam build
          sam deploy --no-confirm-changeset --no-fail-on-empty-changeset
```

## 8. 作業実行スケジュール

### 8.1 実行順序・時間見積もり

| No | 作業項目 | 見積時間 | 状態 |
|----|----------|----------|------|
| 1 | GitHubリポジトリ作成 | 10分 | ⏳未実施 |
| 2 | ローカル環境接続 | 5分 | ⏳未実施 |
| 3 | 初期ディレクトリ構成作成 | 20分 | ⏳未実施 |
| 4 | GitHub Actions基本ワークフロー作成 | 15分 | ⏳未実施 |
| 5 | CLAUDE.mdファイル作成 | 10分 | ⏳未実施 |
| 6 | Claude Code連携設定・動作確認 | 15分 | ⏳未実施 |
| 7 | ブランチ保護設定 | 10分 | ⏳未実施 |
| 8 | GitHub Actions Secrets設定 | 15分 | ⏳未実施 |
| 9 | 初期プルリクエスト作成・動作確認 | 10分 | ⏳未実施 |
| **合計** | **全作業** | **110分** | **0%完了** |

### 8.2 作業完了確認項目

#### GitHubリポジトリ確認
- [ ] リポジトリが https://github.com/taiki-nakamoto/csv-parallel-processing-system で作成されている
- [ ] プライベートリポジトリとして設定されている
- [ ] 初期README.md、.gitignoreが作成されている

#### ローカル環境確認
- [ ] ローカルからリモートリポジトリにプッシュできる
- [ ] developブランチが作成・切り替えできる
- [ ] git status、git remote -v が正常に動作する

#### ブランチ保護確認
- [ ] mainブランチへの直接プッシュがブロックされる
- [ ] developブランチへの直接プッシュがブロックされる
- [ ] プルリクエスト作成・マージができる

#### GitHub Actions確認
- [ ] プルリクエスト作成時にpr-check.ymlが実行される
- [ ] developブランチプッシュ時にdev-deploy.ymlが実行される
- [ ] Secretsが正しく参照されている

#### 全体動作確認
- [ ] feature → develop → main の基本フローが動作する
- [ ] CI/CDパイプラインが正常に動作する

## 9. セキュリティ・運用考慮事項

### 9.1 セキュリティ設定

#### 必須設定
- ✅ プライベートリポジトリ設定
- ⏳ Secretsによる認証情報管理
- ⏳ ブランチ保護による直接プッシュ防止
- ⏳ プルリクエスト必須化

#### 推奨設定
- 定期的なアクセスキーローテーション
- 2要素認証の有効化
- ブラウザでのGitHub Codespacesアクセス制限

### 9.2 運用ルール

#### GitFlow運用
- feature/xxx ブランチでの機能開発
- develop ブランチでの統合・テスト
- main ブランチでの本番リリース
- hotfix/xxx ブランチでの緊急修正

#### レビュープロセス
- 全プルリクエストでのコードレビュー実施
- 重要な変更時の承認者指定
- CI/CDチェック通過の必須化

## 10. 次のステップ

### 10.1 GitHub環境準備完了後
1. **開発ツール準備確認**: SAM CLI、Terraform等のインストール状況確認
2. **インフラ製造開始**: Terraformプロジェクト初期化
3. **SAMアプリケーション開発開始**: Lambda関数実装準備

### 10.2 関連ドキュメント更新
- **04-01_製造準備_AWS環境.md**: GitHub環境準備完了の反映
- **02_Tasks/20250804_01_製造タスク管理.md**: GitHub環境準備フェーズの進捗更新

---

**最終更新**: 2025-08-04  
**承認者**: システム開発チーム  
**次回レビュー**: GitHub環境準備完了後