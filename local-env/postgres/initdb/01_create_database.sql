-- CSVファイル並列処理システム用データベース初期化

-- 拡張機能の有効化
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- タイムゾーン設定
SET timezone = 'Asia/Tokyo';