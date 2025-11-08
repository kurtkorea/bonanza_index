-- FKBRTI 통계 쿼리 (1D, 1W, 1M, 1Y 기간별 DIFF 및 RATIO 통계)
-- QuestDB에서 JSON 파싱 지원 여부에 따라 다르게 동작할 수 있습니다.

-- 방법 1: PostgreSQL JSON 함수 사용 (QuestDB가 지원하는 경우)
-- QuestDB가 PostgreSQL 호환 JSON 함수를 지원한다면 이 방법을 시도할 수 있습니다.

WITH base_data AS (
    SELECT
        createdAt,
        index_mid AS fkbrti_1s,
        avg(index_mid) OVER (
            ORDER BY createdAt
            ROWS BETWEEN 4 PRECEDING AND CURRENT ROW
        ) AS fkbrti_5s,
        expected_status::jsonb AS expected_status_json
    FROM tb_fkbrti_1sec
    WHERE createdAt >= dateadd('d', -365, now())
        AND expected_status IS NOT NULL
),
extracted_prices AS (
    SELECT
        createdAt,
        fkbrti_1s,
        fkbrti_5s,
        -- UPBIT(101) 가격 추출
        (
            SELECT (value->>'price')::double
            FROM jsonb_array_elements(expected_status_json) AS elem
            WHERE (elem->>'exchange') IN ('101', '101')
            LIMIT 1
        ) AS upbit_price,
        -- BITTHUMB(102) 가격 추출
        (
            SELECT (value->>'price')::double
            FROM jsonb_array_elements(expected_status_json) AS elem
            WHERE (elem->>'exchange') IN ('102', '102')
            LIMIT 1
        ) AS bitthumb_price
    FROM base_data
),
calculated_data AS (
    SELECT
        createdAt,
        COALESCE(upbit_price, bitthumb_price, 0) AS base_price,
        fkbrti_1s,
        fkbrti_5s,
        COALESCE(upbit_price, bitthumb_price, 0) - fkbrti_1s AS diff_1s,
        COALESCE(upbit_price, bitthumb_price, 0) - fkbrti_5s AS diff_5s,
        CASE 
            WHEN COALESCE(upbit_price, bitthumb_price, 0) > 0 
            THEN ABS((COALESCE(upbit_price, bitthumb_price, 0) - fkbrti_1s) / COALESCE(upbit_price, bitthumb_price, 0)) * 100
            ELSE 0
        END AS ratio_1s,
        CASE 
            WHEN COALESCE(upbit_price, bitthumb_price, 0) > 0 
            THEN ABS((COALESCE(upbit_price, bitthumb_price, 0) - fkbrti_5s) / COALESCE(upbit_price, bitthumb_price, 0)) * 100
            ELSE 0
        END AS ratio_5s
    FROM extracted_prices
    WHERE COALESCE(upbit_price, bitthumb_price, 0) > 0
        AND fkbrti_1s IS NOT NULL
        AND fkbrti_5s IS NOT NULL
),
period_stats AS (
    SELECT
        '1D' AS period,
        MIN(diff_1s) AS diff_1s_min,
        MAX(diff_1s) AS diff_1s_max,
        AVG(diff_1s) AS diff_1s_avg,
        MIN(ratio_1s) AS ratio_1s_min,
        MAX(ratio_1s) AS ratio_1s_max,
        AVG(ratio_1s) AS ratio_1s_avg,
        MIN(diff_5s) AS diff_5s_min,
        MAX(diff_5s) AS diff_5s_max,
        AVG(diff_5s) AS diff_5s_avg,
        MIN(ratio_5s) AS ratio_5s_min,
        MAX(ratio_5s) AS ratio_5s_max,
        AVG(ratio_5s) AS ratio_5s_avg
    FROM calculated_data
    WHERE createdAt >= dateadd('d', -1, now())
    
    UNION ALL
    
    SELECT
        '1W' AS period,
        MIN(diff_1s) AS diff_1s_min,
        MAX(diff_1s) AS diff_1s_max,
        AVG(diff_1s) AS diff_1s_avg,
        MIN(ratio_1s) AS ratio_1s_min,
        MAX(ratio_1s) AS ratio_1s_max,
        AVG(ratio_1s) AS ratio_1s_avg,
        MIN(diff_5s) AS diff_5s_min,
        MAX(diff_5s) AS diff_5s_max,
        AVG(diff_5s) AS diff_5s_avg,
        MIN(ratio_5s) AS ratio_5s_min,
        MAX(ratio_5s) AS ratio_5s_max,
        AVG(ratio_5s) AS ratio_5s_avg
    FROM calculated_data
    WHERE createdAt >= dateadd('d', -7, now())
    
    UNION ALL
    
    SELECT
        '1M' AS period,
        MIN(diff_1s) AS diff_1s_min,
        MAX(diff_1s) AS diff_1s_max,
        AVG(diff_1s) AS diff_1s_avg,
        MIN(ratio_1s) AS ratio_1s_min,
        MAX(ratio_1s) AS ratio_1s_max,
        AVG(ratio_1s) AS ratio_1s_avg,
        MIN(diff_5s) AS diff_5s_min,
        MAX(diff_5s) AS diff_5s_max,
        AVG(diff_5s) AS diff_5s_avg,
        MIN(ratio_5s) AS ratio_5s_min,
        MAX(ratio_5s) AS ratio_5s_max,
        AVG(ratio_5s) AS ratio_5s_avg
    FROM calculated_data
    WHERE createdAt >= dateadd('d', -30, now())
    
    UNION ALL
    
    SELECT
        '1Y' AS period,
        MIN(diff_1s) AS diff_1s_min,
        MAX(diff_1s) AS diff_1s_max,
        AVG(diff_1s) AS diff_1s_avg,
        MIN(ratio_1s) AS ratio_1s_min,
        MAX(ratio_1s) AS ratio_1s_max,
        AVG(ratio_1s) AS ratio_1s_avg,
        MIN(diff_5s) AS diff_5s_min,
        MAX(diff_5s) AS diff_5s_max,
        AVG(diff_5s) AS diff_5s_avg,
        MIN(ratio_5s) AS ratio_5s_min,
        MAX(ratio_5s) AS ratio_5s_max,
        AVG(ratio_5s) AS ratio_5s_avg
    FROM calculated_data
    WHERE createdAt >= dateadd('d', -365, now())
)
SELECT
    period,
    ROUND(diff_1s_min, 0) AS "DIFF-1s_MIN",
    ROUND(diff_1s_max, 0) AS "DIFF-1s_MAX",
    ROUND(diff_1s_avg, 0) AS "DIFF-1s_AVG",
    ROUND(ratio_1s_min, 2) AS "RATIO-1s_MIN",
    ROUND(ratio_1s_max, 2) AS "RATIO-1s_MAX",
    ROUND(ratio_1s_avg, 2) AS "RATIO-1s_AVG",
    ROUND(diff_5s_min, 0) AS "DIFF-5s_MIN",
    ROUND(diff_5s_max, 0) AS "DIFF-5s_MAX",
    ROUND(diff_5s_avg, 0) AS "DIFF-5s_AVG",
    ROUND(ratio_5s_min, 2) AS "RATIO-5s_MIN",
    ROUND(ratio_5s_max, 2) AS "RATIO-5s_MAX",
    ROUND(ratio_5s_avg, 2) AS "RATIO-5s_AVG"
FROM period_stats
ORDER BY 
    CASE period
        WHEN '1D' THEN 1
        WHEN '1W' THEN 2
        WHEN '1M' THEN 3
        WHEN '1Y' THEN 4
    END;

-- 주의사항:
-- 1. QuestDB가 jsonb 타입과 jsonb_array_elements 함수를 지원하지 않을 수 있습니다.
-- 2. 이 경우 방법 2(문자열 파싱) 또는 방법 3(애플리케이션 레벨 처리)을 사용해야 합니다.

-- 방법 2: 문자열 함수를 사용한 간단한 JSON 파싱 (제한적)
-- QuestDB가 JSON 함수를 지원하지 않는 경우, 정규식이나 문자열 함수로 파싱을 시도할 수 있지만
-- 복잡하고 신뢰성이 떨어질 수 있습니다.

-- 방법 3: 애플리케이션 레벨 처리 (현재 구현)
-- 가장 안정적인 방법은 JavaScript에서 JSON을 파싱하고 계산하는 것입니다.
-- 이미 구현된 getStats() 메서드를 사용하세요.
