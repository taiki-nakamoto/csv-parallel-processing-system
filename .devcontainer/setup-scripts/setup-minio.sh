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