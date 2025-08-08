# Lambda関数ImportModuleError調査結果

## 📋 基本情報

- **実施日**: 2025年8月7日
- **エラー種別**: `Runtime.ImportModuleError: Cannot find module 'handler'`
- **発生場所**: Lambda関数実行時
- **対応担当**: システム開発チーム

## 🚨 エラー概要

### 発生状況
- Step Functions実行でLambda関数呼び出し時にモジュールエラー
- `Runtime.ImportModuleError: Cannot find module 'handler'`
- SAM template.yamlでは`Handler: handler.handler`に設定済み

### 影響範囲
- Lambda関数が全く実行されない状態
- Step Functions全体が機能停止

## 🔍 調査結果

### 1. SAM template.yaml設定確認
- **ハンドラー設定**: `Handler: handler.handler` ✓
- **CodeUri設定**: `src/` ✓
- **Runtime**: `nodejs22.x` ✓

### 2. ソースコード構造確認
- **handler.ts存在**: `/sam/src/handler.ts` ✓
- **export構造**: `export const handler = async (...)` ✓
- **TypeScript設定**: tsconfig.json存在 ✓

### 3. SAMビルド結果分析
**問題発見**: TypeScriptファイルがJavaScriptにコンパイルされていない
- ビルド結果: `.ts`ファイルがそのままコピー
- Node.js実行時: TypeScriptファイルを読み込めない

### 4. 根本原因特定
**原因**: SAMビルドプロセスでTypeScriptコンパイルが実行されない
- `package.json`がsrcディレクトリに存在しない
- SAMがTypeScriptプロジェクトとして認識していない
- 結果：`.ts`ファイルがそのまま実行環境にデプロイされる

## 🛠️ 修正対応

### Phase 1: パッケージ構成修正

**1. package.jsonをsrcディレクトリに配置**
```bash
# package.jsonをsrcに移動
cp package.json src/
```

**2. src/package.jsonの修正**
```json
{
  "name": "csv-processor-lambda",
  "version": "1.0.0", 
  "main": "handler.js",
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    // 既存の依存関係をコピー
  }
}
```

### Phase 2: TypeScript設定修正

**1. tsconfig.jsonをsrcに配置**
```bash
cp tsconfig.json src/
```

**2. tsconfig.jsonの調整**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS", 
    "outDir": "./",
    "rootDir": "./",
    "paths": {
      // 相対パス指定に変更
    }
  }
}
```

### Phase 3: SAM再ビルド・デプロイ

**実行コマンド:**
```bash
cd sam
sam build --debug
sam deploy --no-confirm-changeset
```

## 📝 修正実施記録

### 調査開始時刻
- **調査開始**: 2025-08-07 23:15:00
- **根本原因特定**: 2025-08-07 23:25:00

### 発見された問題
1. **SAMビルド設定不備**: TypeScriptコンパイルが実行されない
2. **package.json配置**: srcディレクトリに配置が必要
3. **パス解決問題**: TypeScriptのパスマッピングが実行時に解決されない

## 🔧 技術的詳細

### SAMビルドログ解析
```
package.json file not found. Continuing the build without dependencies.
Running workflow 'NodejsNpmBuilder'
Running NodejsNpmBuilder:CopySource
```

**問題**: 
- SAMがpackage.jsonを見つけられない
- 依存関係インストールなしでファイルコピーのみ実行
- TypeScriptコンパイルが全く実行されない

### 期待されるビルド結果
```
src/handler.ts → .aws-sam/build/CsvProcessorFunction/handler.js
```

### 実際のビルド結果
```
src/handler.ts → .aws-sam/build/CsvProcessorFunction/handler.ts
```

## 🔄 修正後の検証計画

### 1. SAMビルド確認
- [ ] TypeScriptファイルがJavaScriptにコンパイル
- [ ] 依存関係が正しくインストール
- [ ] handler.jsファイルの生成確認

### 2. ローカルテスト
```bash
sam local invoke CsvProcessorFunction \
  --event test-event.json \
  --env-vars env.json
```

### 3. デプロイ後テスト
- [ ] Step Functions実行で Lambda呼び出し成功
- [ ] モジュールエラーの解消確認

## 📊 対応完了チェック

### 修正ステータス
- [x] **構成修正完了**: SAM template.yamlにesbuild Metadata追加
- [x] **SAM再ビルド完了**: esbuildによるTypeScriptコンパイル成功確認
- [x] **デプロイ完了**: 修正版Lambda関数の適用（23:37完了）
- [ ] **動作確認完了**: Step Functions正常実行確認

### 次のアクション
1. **即座実施**: package.json/tsconfig.jsonの配置修正
2. **SAM再ビルド**: TypeScriptコンパイル実行
3. **再デプロイ**: 修正版Lambda関数適用
4. **動作テスト**: Step Functions実行確認

---

**結論**: SAMビルドプロセスでTypeScriptコンパイルが実行されていないことが根本原因。package.jsonをsrcディレクトリに配置し、適切なビルド設定を行うことで解決可能。