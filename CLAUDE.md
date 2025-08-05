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
- `.devcontainer/`: VS Code Dev Container設定

## VS Code Dev Container環境
- **MinIO**: S3代替（ポート5000/6001）
- **PostgreSQL**: Aurora代替（ポート5432）
- **pgAdmin 4**: PostgreSQL管理画面（ポート8080）
- **DynamoDB Local**: DynamoDB代替（ポート4500）
- **SAM Local**: Lambda開発・テスト（ポート4000/4001）
- **EventBridge**: 開発環境では省略（直接呼び出し）

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
  - `20250804_02_製造タスク_AWS環境準備.md`: AWS準備完了
  - `20250804_03_製造タスク_GitHub環境準備.md`: GitHub準備進行中
- `docs/03_Research/`: 技術調査・検証
  - `20250804_10_Claude CodeでのGitHub作業実施可能性とセキュリティ考慮事項.md`: セキュリティ方針
  - `20250804_17_devcontainer構成検討.md`: Dev Container設定詳細

## 開発ワークフロー
1. VS Code Dev Container起動
2. `sam build` でLambda関数ビルド
3. `sam local start-api --port 4000` でAPIテスト環境起動
4. MinIO Console（http://localhost:6001）でファイル管理
5. pgAdmin 4（http://localhost:8080）でDB管理

## 環境設定値
- MinIO: minioadmin / minioadmin123
- PostgreSQL: postgres / postgres123
- pgAdmin 4: admin@admin.com / admin123