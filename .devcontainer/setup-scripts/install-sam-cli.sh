#!/bin/bash
set -e

echo "Verifying SAM CLI installation..."

# SAM CLI バージョン確認
sam --version

# SAM設定ディレクトリ作成
mkdir -p ~/.aws-sam

echo "SAM CLI verification completed."