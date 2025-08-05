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

# Node.js/TypeScript開発環境
RUN npm install -g \
    typescript \
    @types/node \
    ts-node \
    jest \
    @types/jest \
    eslint \
    prettier \
    @aws-sdk/client-s3 \
    @aws-sdk/client-dynamodb \
    @aws-sdk/client-lambda \
    @aws-sdk/client-step-functions

# 作業ディレクトリ設定
WORKDIR /csvworkspace

# デフォルトユーザー設定
USER vscode