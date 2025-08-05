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