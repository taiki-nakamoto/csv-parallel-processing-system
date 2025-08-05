-- Aurora PostgreSQL初期スキーマ作成スクリプト
-- 参照: 03-14_詳細設計書_データモデル詳細設計.md

-- 拡張機能の有効化
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 共通トリガー関数（更新日時自動更新）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ユーザーマスタテーブル
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(10) PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    
    -- 制約
    CONSTRAINT users_user_id_format CHECK (user_id ~ '^U[0-9]{5}$'),
    CONSTRAINT users_email_format CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT users_username_length CHECK (LENGTH(username) >= 2)
);

-- ユーザーテーブルインデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_active_status ON users(is_active) WHERE is_active = TRUE;

-- ユーザーテーブルトリガー
DROP TRIGGER IF EXISTS users_updated_at_trigger ON users;
CREATE TRIGGER users_updated_at_trigger
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ユーザー統計テーブル
CREATE TABLE IF NOT EXISTS user_statistics (
    user_id VARCHAR(10) PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    login_count BIGINT NOT NULL DEFAULT 0,
    post_count BIGINT NOT NULL DEFAULT 0,
    last_login_date TIMESTAMP WITH TIME ZONE,
    last_post_date TIMESTAMP WITH TIME ZONE,
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_execution_id VARCHAR(100),
    
    -- 制約
    CONSTRAINT user_statistics_login_count_positive CHECK (login_count >= 0),
    CONSTRAINT user_statistics_post_count_positive CHECK (post_count >= 0),
    CONSTRAINT user_statistics_dates_valid CHECK (
        last_login_date IS NULL OR last_login_date <= CURRENT_TIMESTAMP
    ),
    CONSTRAINT user_statistics_execution_id_format CHECK (
        last_execution_id IS NULL OR LENGTH(last_execution_id) <= 100
    )
);

-- ユーザー統計テーブルインデックス
CREATE INDEX IF NOT EXISTS idx_user_statistics_login_count ON user_statistics(login_count DESC);
CREATE INDEX IF NOT EXISTS idx_user_statistics_post_count ON user_statistics(post_count DESC);
CREATE INDEX IF NOT EXISTS idx_user_statistics_last_updated ON user_statistics(last_updated);
CREATE INDEX IF NOT EXISTS idx_user_statistics_last_execution_id ON user_statistics(last_execution_id);
CREATE INDEX IF NOT EXISTS idx_user_statistics_ranking ON user_statistics(login_count DESC, post_count DESC);

-- ユーザー統計テーブルトリガー
DROP TRIGGER IF EXISTS user_statistics_updated_at_trigger ON user_statistics;
CREATE TRIGGER user_statistics_updated_at_trigger
    BEFORE UPDATE ON user_statistics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 処理実行管理テーブル
CREATE TABLE IF NOT EXISTS processing_executions (
    execution_id VARCHAR(100) PRIMARY KEY,
    execution_name VARCHAR(100) NOT NULL,
    s3_bucket VARCHAR(63) NOT NULL,
    s3_key VARCHAR(1024) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE,
    total_records INTEGER DEFAULT 0,
    processed_records INTEGER DEFAULT 0,
    success_records INTEGER DEFAULT 0,
    error_records INTEGER DEFAULT 0,
    processing_time_seconds DECIMAL(10,3),
    execution_input JSONB,
    execution_output JSONB,
    error_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- 制約
    CONSTRAINT processing_executions_status_valid CHECK (
        status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED')
    ),
    CONSTRAINT processing_executions_records_valid CHECK (
        total_records >= 0 AND
        processed_records >= 0 AND
        success_records >= 0 AND
        error_records >= 0 AND
        processed_records = success_records + error_records
    ),
    CONSTRAINT processing_executions_time_valid CHECK (
        end_time IS NULL OR end_time >= start_time
    ),
    CONSTRAINT processing_executions_processing_time_positive CHECK (
        processing_time_seconds IS NULL OR processing_time_seconds >= 0
    )
);

-- 処理実行テーブルインデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_processing_executions_name ON processing_executions(execution_name);
CREATE INDEX IF NOT EXISTS idx_processing_executions_status ON processing_executions(status);
CREATE INDEX IF NOT EXISTS idx_processing_executions_start_time ON processing_executions(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_processing_executions_s3_location ON processing_executions(s3_bucket, s3_key);
CREATE INDEX IF NOT EXISTS idx_processing_executions_processing_time ON processing_executions(processing_time_seconds DESC);
CREATE INDEX IF NOT EXISTS idx_processing_executions_status_time ON processing_executions(status, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_processing_executions_daily_summary ON processing_executions(
    DATE(start_time), status
) WHERE status IN ('SUCCEEDED', 'FAILED');

-- 処理実行テーブルトリガー
DROP TRIGGER IF EXISTS processing_executions_updated_at_trigger ON processing_executions;
CREATE TRIGGER processing_executions_updated_at_trigger
    BEFORE UPDATE ON processing_executions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ファイル処理結果テーブル
CREATE TABLE IF NOT EXISTS file_processing_results (
    result_id VARCHAR(100) PRIMARY KEY,
    execution_id VARCHAR(100) NOT NULL REFERENCES processing_executions(execution_id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    s3_result_bucket VARCHAR(63),
    s3_result_key VARCHAR(1024),
    processing_status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
    total_records INTEGER NOT NULL DEFAULT 0,
    success_records INTEGER NOT NULL DEFAULT 0,
    error_records INTEGER NOT NULL DEFAULT 0,
    validation_time_seconds DECIMAL(8,3),
    processing_time_seconds DECIMAL(8,3),
    validation_summary JSONB DEFAULT '{}',
    processing_summary JSONB DEFAULT '{}',
    error_summary JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- 制約
    CONSTRAINT file_processing_results_status_valid CHECK (
        processing_status IN ('PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')
    ),
    CONSTRAINT file_processing_results_records_valid CHECK (
        total_records >= 0 AND
        success_records >= 0 AND
        error_records >= 0 AND
        total_records = success_records + error_records
    ),
    CONSTRAINT file_processing_results_time_positive CHECK (
        (validation_time_seconds IS NULL OR validation_time_seconds >= 0) AND
        (processing_time_seconds IS NULL OR processing_time_seconds >= 0)
    )
);

-- ファイル処理結果テーブルインデックス
CREATE INDEX IF NOT EXISTS idx_file_processing_results_execution_id ON file_processing_results(execution_id);
CREATE INDEX IF NOT EXISTS idx_file_processing_results_status ON file_processing_results(processing_status);
CREATE INDEX IF NOT EXISTS idx_file_processing_results_file_name ON file_processing_results(file_name);
CREATE INDEX IF NOT EXISTS idx_file_processing_results_created_at ON file_processing_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_processing_results_validation_summary_gin ON file_processing_results USING GIN (validation_summary);
CREATE INDEX IF NOT EXISTS idx_file_processing_results_error_summary_gin ON file_processing_results USING GIN (error_summary);

-- ファイル処理結果テーブルトリガー
DROP TRIGGER IF EXISTS file_processing_results_updated_at_trigger ON file_processing_results;
CREATE TRIGGER file_processing_results_updated_at_trigger
    BEFORE UPDATE ON file_processing_results
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- バッチ処理ログテーブル
CREATE TABLE IF NOT EXISTS batch_processing_logs (
    log_id BIGSERIAL PRIMARY KEY,
    execution_id VARCHAR(100) REFERENCES processing_executions(execution_id) ON DELETE SET NULL,
    log_level VARCHAR(10) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    source_component VARCHAR(50),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    correlation_id VARCHAR(100),
    
    -- 制約
    CONSTRAINT batch_processing_logs_level_valid CHECK (
        log_level IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')
    )
);

-- バッチ処理ログテーブルインデックス
CREATE INDEX IF NOT EXISTS idx_batch_processing_logs_execution_id ON batch_processing_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_batch_processing_logs_timestamp ON batch_processing_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_batch_processing_logs_level ON batch_processing_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_batch_processing_logs_event_type ON batch_processing_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_batch_processing_logs_correlation_id ON batch_processing_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_batch_processing_logs_search ON batch_processing_logs(
    execution_id, log_level, timestamp DESC
);
CREATE INDEX IF NOT EXISTS idx_batch_processing_logs_details_gin ON batch_processing_logs USING GIN (details);

-- システム設定テーブル
CREATE TABLE IF NOT EXISTS system_configurations (
    config_key VARCHAR(100) PRIMARY KEY,
    config_value TEXT NOT NULL,
    description TEXT,
    data_type VARCHAR(20) NOT NULL DEFAULT 'string',
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    
    -- 制約
    CONSTRAINT system_configurations_data_type_valid CHECK (
        data_type IN ('string', 'integer', 'boolean', 'json', 'decimal')
    )
);

-- システム設定テーブルインデックス
CREATE INDEX IF NOT EXISTS idx_system_configurations_data_type ON system_configurations(data_type);
CREATE INDEX IF NOT EXISTS idx_system_configurations_sensitive ON system_configurations(is_sensitive);

-- システム設定テーブルトリガー
DROP TRIGGER IF EXISTS system_configurations_updated_at_trigger ON system_configurations;
CREATE TRIGGER system_configurations_updated_at_trigger
    BEFORE UPDATE ON system_configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ユーザー統計更新関数
CREATE OR REPLACE FUNCTION update_user_statistics(
    p_user_id VARCHAR(10),
    p_login_increment BIGINT DEFAULT 0,
    p_post_increment BIGINT DEFAULT 0,
    p_execution_id VARCHAR(100) DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_statistics (
        user_id, 
        login_count, 
        post_count, 
        last_login_date, 
        last_post_date,
        last_execution_id
    )
    VALUES (
        p_user_id,
        p_login_increment,
        p_post_increment,
        CASE WHEN p_login_increment > 0 THEN CURRENT_TIMESTAMP ELSE NULL END,
        CASE WHEN p_post_increment > 0 THEN CURRENT_TIMESTAMP ELSE NULL END,
        p_execution_id
    )
    ON CONFLICT (user_id) DO UPDATE SET
        login_count = user_statistics.login_count + p_login_increment,
        post_count = user_statistics.post_count + p_post_increment,
        last_login_date = CASE 
            WHEN p_login_increment > 0 THEN CURRENT_TIMESTAMP 
            ELSE user_statistics.last_login_date 
        END,
        last_post_date = CASE 
            WHEN p_post_increment > 0 THEN CURRENT_TIMESTAMP 
            ELSE user_statistics.last_post_date 
        END,
        last_updated = CURRENT_TIMESTAMP,
        last_execution_id = COALESCE(p_execution_id, user_statistics.last_execution_id);
END;
$$ LANGUAGE plpgsql;

-- 設定値取得関数
CREATE OR REPLACE FUNCTION get_config_value(
    p_config_key VARCHAR(100),
    p_default_value TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
    v_config_value TEXT;
BEGIN
    SELECT config_value INTO v_config_value
    FROM system_configurations
    WHERE config_key = p_config_key;
    
    RETURN COALESCE(v_config_value, p_default_value);
END;
$$ LANGUAGE plpgsql;

-- 初期設定データ
INSERT INTO system_configurations (config_key, config_value, description, data_type) VALUES
('max_parallel_executions', '5', '最大並列実行数', 'integer'),
('csv_max_file_size_mb', '100', 'CSV最大ファイルサイズ（MB）', 'integer'),
('processing_timeout_minutes', '15', '処理タイムアウト（分）', 'integer'),
('validation_enabled', 'true', 'バリデーション有効フラグ', 'boolean'),
('audit_log_retention_days', '90', '監査ログ保持期間（日）', 'integer')
ON CONFLICT (config_key) DO NOTHING;

-- ビュー：実行統計
CREATE OR REPLACE VIEW v_execution_statistics AS
SELECT
    DATE(start_time) AS execution_date,
    status,
    COUNT(*) AS execution_count,
    AVG(processing_time_seconds) AS avg_processing_time,
    MIN(processing_time_seconds) AS min_processing_time,
    MAX(processing_time_seconds) AS max_processing_time,
    SUM(total_records) AS total_records_processed,
    SUM(success_records) AS total_success_records,
    SUM(error_records) AS total_error_records,
    ROUND(
        (SUM(success_records)::DECIMAL / NULLIF(SUM(total_records), 0)) * 100, 2
    ) AS success_rate_percentage
FROM processing_executions
WHERE start_time >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(start_time), status
ORDER BY execution_date DESC, status;

-- ビュー：ユーザー統計ランキング
CREATE OR REPLACE VIEW v_user_statistics_ranking AS
SELECT
    ROW_NUMBER() OVER (ORDER BY us.login_count DESC, us.post_count DESC) AS rank,
    u.user_id,
    u.username,
    us.login_count,
    us.post_count,
    us.last_login_date,
    us.last_post_date,
    us.last_updated
FROM users u
JOIN user_statistics us ON u.user_id = us.user_id
WHERE u.is_active = TRUE
ORDER BY us.login_count DESC, us.post_count DESC;

-- テーブルコメント
COMMENT ON TABLE users IS 'ユーザーマスタテーブル';
COMMENT ON TABLE user_statistics IS 'ユーザー統計情報テーブル（ログイン・投稿回数）';
COMMENT ON TABLE processing_executions IS 'Step Functions実行管理テーブル';
COMMENT ON TABLE file_processing_results IS 'ファイル処理結果テーブル';
COMMENT ON TABLE batch_processing_logs IS 'バッチ処理構造化ログテーブル';
COMMENT ON TABLE system_configurations IS 'システム設定テーブル';

-- 関数コメント
COMMENT ON FUNCTION update_user_statistics IS 'ユーザー統計更新関数（UPSERT処理）';
COMMENT ON FUNCTION get_config_value IS '設定値取得関数（デフォルト値対応）';

-- ビューコメント  
COMMENT ON VIEW v_execution_statistics IS '実行統計ビュー（日次・ステータス別）';
COMMENT ON VIEW v_user_statistics_ranking IS 'ユーザー統計ランキングビュー（アクティブユーザーのみ）';