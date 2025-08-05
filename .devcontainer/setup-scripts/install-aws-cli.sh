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