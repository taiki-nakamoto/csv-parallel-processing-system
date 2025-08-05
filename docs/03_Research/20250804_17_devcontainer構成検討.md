# devcontainer構成検討

## 1. ドキュメント情報

| 項目 | 内容 |
|------|------|
| ドキュメント名 | devcontainer構成検討 |
| バージョン | 1.0 |
| 作成日 | 2025-08-04 |
| 作成者 | システム開発チーム |
| 参照元 | 20250804_07_AWS開発環境のローカル構築調査.md |

## 2. devcontainer概要

### 2.1 目的
CSVファイル並列処理システムの開発環境を、VS Code Dev Containersを使用してコンテナ化し、開発者間での環境統一と迅速なセットアップを実現する。

### 2.2 対象AWSサービスとローカル代替
| AWSサービス | ローカル代替 | 理由 |
|-------------|-------------|------|
| S3 | MinIO | 最も成熟したS3代替、本格的な開発に適している |
| EventBridge | 不要 | 開発時はS3イベントを直接Lambda呼び出しでシミュレート |
| Lambda | AWS SAM Local | AWS公式サポート、豊富なテスト機能 |
| DynamoDB | AWS SAM Local | AWS公式、SAMとの優秀な統合 |
| Aurora/PostgreSQL | PostgreSQL Docker | シンプルで軽量、開発に十分 |
| Step Functions | AWS SAM Local | SAMでのローカル実行サポート |

## 3. devcontainer構成設計

### 3.1 ディレクトリ構造
```
csv-parallel-processing-system/
├── .devcontainer/
│   ├── devcontainer.json          # Dev Container設定
│   ├── docker-compose.yml         # 開発環境サービス構成
│   ├── Dockerfile                 # 開発コンテナイメージ
│   └── setup-scripts/
│       ├── install-aws-cli.sh     # AWS CLI インストール
│       ├── install-sam-cli.sh     # SAM CLI インストール
│       ├── setup-minio.sh         # MinIO初期設定
│       └── setup-postgres.sh      # PostgreSQL初期設定
├── local-env/
│   ├── minio/
│   │   ├── data/                  # MinIOデータ永続化
│   │   └── config/                # MinIO設定
│   ├── postgres/
│   │   ├── data/                  # PostgreSQLデータ永続化
│   │   ├── initdb/                # 初期化SQLスクリプト
│   │   │   ├── 01_create_database.sql
│   │   │   ├── 02_create_tables.sql
│   │   │   └── 03_insert_sample_data.sql
│   │   └── config/                # PostgreSQL設定
│   ├── pgadmin/                   # pgAdmin 4設定永続化
│   └── dynamodb/
│       └── data/                  # DynamoDB Local データ永続化
```

### 3.2 devcontainer.json設定
```json
{
  "name": "CSV Parallel Processing System",
  "dockerComposeFile": [
    "docker-compose.yml"
  ],
  "service": "dev-container",
  "workspaceFolder": "/csvworkspace",
  "shutdownAction": "stopCompose",
  
  "features": {
    "ghcr.io/devcontainers/features/node:1": {
      "version": "22"
    },
    "ghcr.io/devcontainers/features/python:1": {
      "version": "3.12"
    },
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers/features/git:1": {}
  },
  
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-vscode.vscode-typescript-next",
        "ms-python.python",
        "ms-python.flake8",
        "ms-python.black-formatter",
        "amazonwebservices.aws-toolkit-vscode",
        "hashicorp.terraform",
        "ms-vscode.vscode-json",
        "redhat.vscode-yaml",
        "ms-vscode.test-adapter-converter",
        "hbenl.vscode-test-explorer",
        "bierner.markdown-mermaid"
      ],
      "settings": {
        "terminal.integrated.defaultProfile.linux": "bash",
        "python.defaultInterpreterPath": "/usr/local/bin/python",
        "python.linting.enabled": true,
        "python.linting.flake8Enabled": true,
        "python.formatting.provider": "black"
      }
    }
  },
  
  "forwardPorts": [
    4000,  // SAM Local API
    4001,  // SAM Local Lambda
    4500,  // DynamoDB Local
    5000,  // MinIO API
    6001,  // MinIO Console
    5432,  // PostgreSQL
    8080   // pgAdmin 4
  ],
  
  "portsAttributes": {
    "6001": {
      "label": "MinIO Console",
      "onAutoForward": "openPreview"
    },
    "4000": {
      "label": "SAM Local API Gateway"
    },
    "8080": {
      "label": "pgAdmin 4",
      "onAutoForward": "openPreview"
    }
  },
  
  "postCreateCommand": ".devcontainer/setup-scripts/install-aws-cli.sh && .devcontainer/setup-scripts/install-sam-cli.sh",
  "postStartCommand": ".devcontainer/setup-scripts/setup-minio.sh && .devcontainer/setup-scripts/setup-postgres.sh",
  
  "remoteUser": "vscode"
}
```

### 3.3 docker-compose.yml設定
```yaml
version: '3.8'

services:
  # 開発コンテナ
  dev-container:
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - ../..:/csvworkspace:cached
      - /var/run/docker.sock:/var/run/docker.sock
    command: sleep infinity
    networks:
      - aws-local-dev
    environment:
      - AWS_DEFAULT_REGION=ap-northeast-1
      - AWS_ACCESS_KEY_ID=test
      - AWS_SECRET_ACCESS_KEY=test
      - MINIO_ENDPOINT=http://minio:5000
      - POSTGRES_HOST=postgres
      - DYNAMODB_ENDPOINT=http://dynamodb:4500

  # MinIO (S3代替)
  minio:
    image: minio/minio:latest
    container_name: csv-minio
    ports:
      - "5000:9000"  # API
      - "6001:9001"  # Console
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    volumes:
      - ../local-env/minio/data:/data
    command: server /data --console-address ":9001"
    networks:
      - aws-local-dev
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 30s
      timeout: 20s
      retries: 3

  # PostgreSQL (Aurora代替)
  postgres:
    image: postgres:15-alpine
    container_name: csv-postgres
    environment:
      POSTGRES_DB: csv_processing
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres123
      POSTGRES_INITDB_ARGS: "--encoding=UTF-8 --locale=C"
    ports:
      - "5432:5432"
    volumes:
      - ../local-env/postgres/data:/var/lib/postgresql/data
      - ../local-env/postgres/initdb:/docker-entrypoint-initdb.d
    networks:
      - aws-local-dev
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # pgAdmin 4
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: csv-pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@admin.com
      PGADMIN_DEFAULT_PASSWORD: admin123
      PGADMIN_CONFIG_SERVER_MODE: 'False'
    ports:
      - "8080:80"
    volumes:
      - ../local-env/pgadmin:/var/lib/pgadmin
    networks:
      - aws-local-dev
    depends_on:
      - postgres

  # DynamoDB Local
  dynamodb:
    image: amazon/dynamodb-local:latest
    container_name: csv-dynamodb
    ports:
      - "4500:8000"
    command: "-jar DynamoDBLocal.jar -sharedDb -dbPath ./data"
    volumes:
      - ../local-env/dynamodb/data:/home/dynamodblocal/data
    networks:
      - aws-local-dev
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8000/ || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
  minio_data:
  dynamodb_data:
  pgadmin_data:

networks:
  aws-local-dev:
    name: aws-local-dev
    driver: bridge
```

### 3.4 Dockerfile設定
```dockerfile
FROM mcr.microsoft.com/devcontainers/typescript-node:22

# タイムゾーン設定
ENV TZ=Asia/Tokyo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 必要なパッケージのインストール
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    unzip \
    git \
    jq \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# AWS CLI v2 インストール
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf aws awscliv2.zip

# SAM CLI インストール
RUN wget https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-linux-x86_64.zip \
    && unzip aws-sam-cli-linux-x86_64.zip -d sam-installation \
    && ./sam-installation/install \
    && rm -rf sam-installation aws-sam-cli-linux-x86_64.zip

# MinIO Client インストール
RUN wget https://dl.min.io/client/mc/release/linux-amd64/mc \
    && chmod +x mc \
    && mv mc /usr/local/bin/

# Python開発環境
RUN pip install --no-cache-dir \
    boto3 \
    pytest \
    pytest-cov \
    black \
    flake8 \
    mypy

# Node.js開発環境
RUN npm install -g \
    typescript \
    @types/node \
    ts-node \
    jest \
    @types/jest \
    eslint \
    prettier

# 作業ディレクトリ設定
WORKDIR /csvworkspace

# デフォルトユーザー設定
USER vscode
```

## 4. セットアップスクリプト

### 4.1 install-aws-cli.sh
```bash
#!/bin/bash
set -e

echo "Setting up AWS CLI configuration..."

# AWS CLI設定（ローカル開発用）
mkdir -p ~/.aws
cat > ~/.aws/config << EOF
[default]
region = ap-northeast-1
output = json
EOF

cat > ~/.aws/credentials << EOF
[default]
aws_access_key_id = test
aws_secret_access_key = test
EOF

echo "AWS CLI configuration completed."
```

### 4.2 install-sam-cli.sh
```bash
#!/bin/bash
set -e

echo "Verifying SAM CLI installation..."

# SAM CLI バージョン確認
sam --version

# SAM設定ディレクトリ作成
mkdir -p ~/.aws-sam

echo "SAM CLI verification completed."
```

### 4.3 setup-minio.sh
```bash
#!/bin/bash
set -e

echo "Setting up MinIO..."

# MinIOクライアント設定
mc alias set local http://minio:9000 minioadmin minioadmin123

# 開発用バケット作成
mc mb local/csv-input-bucket --ignore-existing
mc mb local/csv-output-bucket --ignore-existing
mc mb local/csv-error-bucket --ignore-existing

# バケットポリシー設定（開発用）
mc anonymous set public local/csv-input-bucket
mc anonymous set public local/csv-output-bucket
mc anonymous set public local/csv-error-bucket

echo "MinIO setup completed."
echo "MinIO Console: http://localhost:6001"
echo "Username: minioadmin, Password: minioadmin123"
```

### 4.4 setup-postgres.sh
```bash
#!/bin/bash
set -e

echo "Setting up PostgreSQL..."

# PostgreSQL接続確認
until pg_isready -h postgres -p 5432 -U postgres; do
  echo "Waiting for PostgreSQL to be ready..."
  sleep 2
done

echo "PostgreSQL setup completed."
echo "Connection: postgresql://postgres:postgres123@localhost:5432/csv_processing"
```

## 5. 初期化SQLスクリプト

### 5.1 01_create_database.sql
```sql
-- CSVファイル並列処理システム用データベース初期化

-- 拡張機能の有効化
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- タイムゾーン設定
SET timezone = 'Asia/Tokyo';
```

### 5.2 02_create_tables.sql
```sql
-- processing_logsテーブル作成
CREATE TABLE processing_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id VARCHAR(255) NOT NULL,
    file_name VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    chunk_count INTEGER NOT NULL,
    processing_status VARCHAR(50) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- インデックス作成
CREATE INDEX idx_processing_logs_execution_id ON processing_logs(execution_id);
CREATE INDEX idx_processing_logs_status ON processing_logs(processing_status);
CREATE INDEX idx_processing_logs_start_time ON processing_logs(start_time);

-- updated_atの自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_processing_logs_updated_at 
    BEFORE UPDATE ON processing_logs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 5.3 03_insert_sample_data.sql
```sql
-- サンプルデータ投入
INSERT INTO processing_logs (
    execution_id,
    file_name,
    file_size,
    chunk_count,
    processing_status,
    start_time,
    end_time
) VALUES 
(
    'exec-' || uuid_generate_v4(),
    'sample_data_001.csv',
    1048576,
    10,
    'completed',
    CURRENT_TIMESTAMP - INTERVAL '1 hour',
    CURRENT_TIMESTAMP - INTERVAL '50 minutes'
),
(
    'exec-' || uuid_generate_v4(),
    'sample_data_002.csv',
    2097152,
    20,
    'completed',
    CURRENT_TIMESTAMP - INTERVAL '2 hours',
    CURRENT_TIMESTAMP - INTERVAL '1 hour 45 minutes'
),
(
    'exec-' || uuid_generate_v4(),
    'sample_data_003.csv',
    5242880,
    50,
    'processing',
    CURRENT_TIMESTAMP - INTERVAL '30 minutes',
    NULL
);
```

## 6. 開発環境動作確認

### 6.1 環境起動手順
```bash
# Dev Container起動
1. VS Codeでプロジェクトフォルダを開く
2. Ctrl+Shift+P → "Dev Containers: Reopen in Container"
3. 初回起動時は自動でセットアップスクリプトが実行される

# サービス動作確認
4. MinIO Console: http://localhost:6001
5. PostgreSQL接続: postgresql://postgres:postgres123@localhost:5432/csv_processing
6. DynamoDB Local: http://localhost:4500
7. pgAdmin 4: http://localhost:8080 (admin@admin.com / admin123)
```

### 6.2 SAM Local動作確認
```bash
# SAMプロジェクトのビルド
cd sam
sam build

# ローカルAPI起動（ポート4000で起動）
sam local start-api --port 4000 --docker-network aws-local-dev

# Lambda関数の単体テスト
sam local invoke HelloWorldFunction --event events/event.json --docker-network aws-local-dev

# DynamoDB接続確認
aws dynamodb list-tables --endpoint-url http://localhost:4500
```

### 6.3 PostgreSQL動作確認
```bash
# PostgreSQL接続確認
psql -h localhost -U postgres -d csv_processing

# テーブル確認
\dt

# サンプルデータ確認
SELECT * FROM processing_logs;
```

## 7. 開発ワークフロー

### 7.1 開発開始手順
1. VS Code Dev Container起動
2. 自動セットアップ完了確認
3. `sam build` でLambda関数ビルド
4. `sam local start-api` でAPIテスト環境起動
5. MinIO Consoleでバケット・ファイル管理

### 7.2 テスト実行手順
```bash
# Lambda関数テスト
cd sam
npm test

# DynamoDB操作テスト
python tests/test_dynamodb.py

# PostgreSQL操作テスト
pytest tests/test_postgres.py

# 統合テスト
sam local start-api --port 4000 --docker-network aws-local-dev
pytest tests/integration/
```

### 7.3 デバッグ手順
1. VS CodeのDebug機能でLambda関数にブレークポイント設定
2. SAM Local経由でのデバッグ実行
3. Docker Compose logsでサービス状態確認

## 8. 本番環境との差異

### 8.1 設定値の違い
| 項目 | ローカル環境 | 本番環境 |
|------|-------------|----------|
| S3エンドポイント | http://minio:9000 (ポート5000でアクセス) | AWS S3 |
| DynamoDBエンドポイント | http://dynamodb:8000 (ポート4500でアクセス) | AWS DynamoDB |
| PostgreSQL接続 | postgres://postgres:postgres123@postgres:5432 | Aurora Serverless |
| EventBridge | 無効（直接呼び出し） | AWS EventBridge |
| pgAdmin 4 | http://localhost:8080 | 本番環境では不使用 |

### 8.2 移行時の注意点
- 環境変数による設定切り替え
- IAMロール・ポリシーの適用
- VPC・セキュリティグループ設定
- 本番データベーススキーマとの同期

## 9. 運用・保守

### 9.1 データ永続化
- PostgreSQLデータ: `local-env/postgres/data`
- MinIOデータ: `local-env/minio/data`
- DynamoDBデータ: `local-env/dynamodb/data`
- pgAdmin設定: `local-env/pgadmin`

### 9.2 環境リセット手順
```bash
# コンテナ・ボリューム削除
docker-compose down -v
rm -rf local-env/*/data/*

# 環境再構築
VS Code Dev Container再起動
```

### 9.3 トラブルシューティング
- ポート競合: `docker-compose ps`で状態確認
- ネットワーク問題: `docker network ls`でネットワーク確認
- データ問題: ボリュームリセット後に再構築

## 10. まとめ

### 10.1 採用理由
- **統一された開発環境**: チーム全体で同一環境での開発
- **迅速なセットアップ**: Dev Container起動のみで環境構築完了
- **本番環境類似性**: AWSサービスとの互換性を保った代替サービス使用
- **EventBridge省略**: 開発効率を重視し、S3イベント直接処理でシンプル化

### 10.2 期待効果
- 開発環境セットアップ時間短縮（手動30分 → 自動5分）
- 環境差異によるバグ削減
- ローカルでの完全なテスト実行が可能
- CI/CDパイプラインとの整合性向上

---

**最終更新**: 2025-08-04  
**ステータス**: ✅検討完了  
**次のアクション**: devcontainer実装開始