-- ============================================
-- Aurora PostgreSQL スキーマ確認用クエリ
-- ============================================
-- 実行方法: psql -h <endpoint> -U postgres -d csvbatch -f verify-aurora-schema.sql
-- ============================================

\echo '=== 1. データベース接続確認 ==='
SELECT current_database(), current_user, version();

\echo ''
\echo '=== 2. 作成されたテーブル一覧 ==='
SELECT 
    schemaname,
    tablename,
    tableowner,
    tablespace
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

\echo ''
\echo '=== 3. テーブルレコード数確認 ==='
SELECT 
    'users' AS table_name,
    COUNT(*) AS record_count
FROM users
UNION ALL
SELECT 
    'user_statistics' AS table_name,
    COUNT(*) AS record_count
FROM user_statistics
UNION ALL
SELECT 
    'processing_executions' AS table_name,
    COUNT(*) AS record_count
FROM processing_executions
UNION ALL
SELECT 
    'file_processing_results' AS table_name,
    COUNT(*) AS record_count
FROM file_processing_results
UNION ALL
SELECT 
    'batch_processing_logs' AS table_name,
    COUNT(*) AS record_count
FROM batch_processing_logs
UNION ALL
SELECT 
    'system_configurations' AS table_name,
    COUNT(*) AS record_count
FROM system_configurations
ORDER BY table_name;

\echo ''
\echo '=== 4. インデックス確認 ==='
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

\echo ''
\echo '=== 5. 関数・プロシージャ確認 ==='
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

\echo ''
\echo '=== 6. ビュー確認 ==='
SELECT 
    table_name,
    view_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

\echo ''
\echo '=== 7. 拡張機能確認 ==='
SELECT 
    extname,
    extversion,
    extnamespace::regnamespace AS schema
FROM pg_extension
ORDER BY extname;

\echo ''
\echo '=== 8. システム設定初期データ確認 ==='
SELECT 
    config_key,
    config_value,
    description,
    data_type,
    is_sensitive
FROM system_configurations
ORDER BY config_key;

\echo ''
\echo '=== 9. テーブル制約確認 ==='
SELECT 
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

\echo ''
\echo '=== 10. テーブルサイズ確認 ==='
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

\echo ''
\echo '=== スキーマ確認完了 ==='