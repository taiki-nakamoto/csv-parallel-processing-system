# DevContainerエラー調査とpackage.json依存関係管理

## エラー内容

### 発生したエラー
```
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@aws-sdk%2fclient-step-functions - Not found
npm error 404
npm error 404  '@aws-sdk/client-step-functions@*' is not in this registry.
```

### エラー発生箇所
- DevContainer構築時のDockerfile実行中
- `npm install -g` でAWS SDKパッケージのインストール時
- 具体的には `@aws-sdk/client-step-functions` パッケージが見つからない

### 実行されたコマンド
```bash
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
```

## 調査結果

### 1. AWS SDKパッケージ名の正確性調査

#### 調査方法
- Web検索による公式ドキュメント確認
- npmレジストリでの正しいパッケージ名確認

#### 調査結果：パッケージ名が正しくない
- **誤**: `@aws-sdk/client-step-functions`
- **正**: `@aws-sdk/client-sfn`

#### 根拠
1. AWS公式ドキュメントでは `@aws-sdk/client-sfn` と記載
2. npmレジストリに `@aws-sdk/client-step-functions` は存在しない
3. Step Functions = SFN (Simple Flow Service) の略称を使用

### 2. 現在のDevContainer設定確認

#### Dockerfile設定（現状）
- ベースイメージ: `mcr.microsoft.com/devcontainers/typescript-node:22`
- npm グローバルインストールで依存パッケージを管理
- 問題のあるパッケージ名: `@aws-sdk/client-step-functions`

#### package.json設定（現状）
- 同じく誤ったパッケージ名 `@aws-sdk/client-step-functions` を使用
- ただし、こちらは依存関係として正しく管理されている構造

### 3. package.jsonでの依存関係管理方式検討

#### 現状の問題点
1. **グローバルインストールの課題**
   - バージョン管理が困難
   - プロジェクト固有の依存関係管理ができない
   - 他の開発者との環境差異が発生しやすい

2. **パッケージ名の誤り**
   - Dockerfileとpackage.json両方で同じ誤りが発生

#### 推奨方式：package.jsonベースの依存関係管理

##### メリット
1. **バージョン管理の精度向上**
   - 正確なバージョン指定が可能
   - package-lock.jsonによる再現性確保

2. **開発環境の統一**
   - 全開発者が同じ依存関係を使用
   - CI/CDでも同じ環境を再現可能

3. **セキュリティ向上**
   - 脆弱性のあるパッケージの特定が容易
   - npm auditによる脆弱性チェック

##### 実装方針
1. **Dockerfileの修正**
   - グローバルインストールを削除
   - 開発用ツールのみグローバルインストール

2. **package.jsonの修正**
   - 正しいパッケージ名への変更
   - devDependenciesとdependenciesの適切な分類

## 対応案

### 案1: 最小限修正（即座に対応可能）
```dockerfile
# Dockerfileの修正
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
    @aws-sdk/client-sfn  # ← client-step-functionsをclient-sfnに変更
```

```json
// package.jsonの修正
"dependencies": {
  "@aws-sdk/client-s3": "^3.0.0",
  "@aws-sdk/client-dynamodb": "^3.0.0",
  "@aws-sdk/client-lambda": "^3.0.0",
  "@aws-sdk/client-sfn": "^3.0.0"  // ← 同様に修正
}
```

### 案2: 推奨修正（根本的な改善）
```dockerfile
# Dockerfileの修正
RUN npm install -g \
    typescript \
    ts-node \
    prettier  # 最小限のグローバルツールのみ

# package.jsonベースでの依存関係管理に移行
WORKDIR /csvworkspace
COPY package*.json ./
RUN npm ci
```

```json
// package.jsonの修正
{
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "jest": "^29.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.0.0"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.450.0",
    "@aws-sdk/client-dynamodb": "^3.450.0", 
    "@aws-sdk/client-lambda": "^3.450.0",
    "@aws-sdk/client-sfn": "^3.450.0"  // 正しいパッケージ名
  }
}
```

## 推奨する対応方針

### 段階的アプローチ
1. **Phase 1**: パッケージ名のみ修正（案1）
   - 即座にDevContainerエラーを解決
   - 最小限のリスクで対応

2. **Phase 2**: package.jsonベース管理への移行（案2）
   - より良い開発環境の構築
   - 長期的な保守性向上

### 直近の対応
- Dockerfileの `@aws-sdk/client-step-functions` を `@aws-sdk/client-sfn` に修正
- package.jsonも同様に修正
- DevContainerの再ビルド実行

### 今後の改善
- グローバルインストールからpackage.jsonベース管理への移行検討
- CI/CDパイプラインでのpackage.json依存関係チェック強化