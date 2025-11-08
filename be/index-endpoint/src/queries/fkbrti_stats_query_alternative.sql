-- 방법 2: 문자열 함수를 사용한 JSON 파싱 (QuestDB JSON 함수 미지원 시)
-- 주의: 이 방법은 간단한 JSON 구조에만 작동하며, 복잡한 구조에서는 실패할 수 있습니다.
-- 정규식을 사용하여 exchange와 price 값을 추출합니다.

WITH base_data AS (
    SELECT
        createdAt,
        index_mid AS fkbrti_1s,
        avg(index_mid) OVER (
            ORDER BY createdAt
            ROWS BETWEEN 4 PRECEDING AND CURRENT ROW
        ) AS fkbrti_5s,
        expected_status
    FROM tb_fkbrti_1sec
    WHERE createdAt >= dateadd('d', -365, now())
        AND expected_status IS NOT NULL
),
extracted_prices AS (
    SELECT
        createdAt,
        fkbrti_1s,
        fkbrti_5s,
        -- UPBIT(101) 가격 추출 (정규식 사용)
        CAST(
            regexp_replace(
                regexp_replace(expected_status, '.*"exchange"\s*:\s*"101"[^}]*"price"\s*:\s*([0-9.]+).*', '\1'),
                '.*"exchange"\s*:\s*101[^}]*"price"\s*:\s*([0-9.]+).*', '\1'
            ) AS DOUBLE
        ) AS upbit_price,
        -- BITTHUMB(102) 가격 추출 (정규식 사용)
        CAST(
            regexp_replace(
                regexp_replace(expected_status, '.*"exchange"\s*:\s*"102"[^}]*"price"\s*:\s*([0-9.]+).*', '\1'),
                '.*"exchange"\s*:\s*102[^}]*"price"\s*:\s*([0-9.]+).*', '\1'
            ) AS DOUBLE
        ) AS bitthumb_price
    FROM base_data
    WHERE expected_status LIKE '%"exchange"%'
        AND expected_status LIKE '%"price"%'
),
calculated_data AS (
    SELECT
        createdAt,
        CASE 
            WHEN upbit_price > 0 THEN upbit_price
            WHEN bitthumb_price > 0 THEN bitthumb_price
            ELSE 0
        END AS base_price,
        fkbrti_1s,
        fkbrti_5s,
        CASE 
            WHEN upbit_price > 0 THEN upbit_price - fkbrti_1s
            WHEN bitthumb_price > 0 THEN bitthumb_price - fkbrti_1s
            ELSE 0
        END AS diff_1s,
        CASE 
            WHEN upbit_price > 0 THEN upbit_price - fkbrti_5s
            WHEN bitthumb_price > 0 THEN bitthumb_price - fkbrti_5s
            ELSE 0
        END AS diff_5s,
        CASE 
            WHEN upbit_price > 0 AND upbit_price > 0
            THEN ABS((upbit_price - fkbrti_1s) / upbit_price) * 100
            WHEN bitthumb_price > 0 AND bitthumb_price > 0
            THEN ABS((bitthumb_price - fkbrti_1s) / bitthumb_price) * 100
            ELSE 0
        END AS ratio_1s,
        CASE 
            WHEN upbit_price > 0 AND upbit_price > 0
            THEN ABS((upbit_price - fkbrti_5s) / upbit_price) * 100
            WHEN bitthumb_price > 0 AND bitthumb_price > 0
            THEN ABS((bitthumb_price - fkbrti_5s) / bitthumb_price) * 100
            ELSE 0
        END AS ratio_5s
    FROM extracted_prices
    WHERE (upbit_price > 0 OR bitthumb_price > 0)
        AND fkbrti_1s IS NOT NULL
        AND fkbrti_5s IS NOT NULL
)
-- 기간별 통계는 방법 1과 동일하게 UNION ALL로 구성
SELECT
    '1D' AS period,
    ROUND(MIN(diff_1s), 0) AS "DIFF-1s_MIN",
    ROUND(MAX(diff_1s), 0) AS "DIFF-1s_MAX",
    ROUND(AVG(diff_1s), 0) AS "DIFF-1s_AVG",
    ROUND(MIN(ratio_1s), 2) AS "RATIO-1s_MIN",
    ROUND(MAX(ratio_1s), 2) AS "RATIO-1s_MAX",
    ROUND(AVG(ratio_1s), 2) AS "RATIO-1s_AVG",
    ROUND(MIN(diff_5s), 0) AS "DIFF-5s_MIN",
    ROUND(MAX(diff_5s), 0) AS "DIFF-5s_MAX",
    ROUND(AVG(diff_5s), 0) AS "DIFF-5s_AVG",
    ROUND(MIN(ratio_5s), 2) AS "RATIO-5s_MIN",
    ROUND(MAX(ratio_5s), 2) AS "RATIO-5s_MAX",
    ROUND(AVG(ratio_5s), 2) AS "RATIO-5s_AVG"
FROM calculated_data
WHERE createdAt >= dateadd('d', -1, now())

UNION ALL

SELECT
    '1W' AS period,
    ROUND(MIN(diff_1s), 0) AS "DIFF-1s_MIN",
    ROUND(MAX(diff_1s), 0) AS "DIFF-1s_MAX",
    ROUND(AVG(diff_1s), 0) AS "DIFF-1s_AVG",
    ROUND(MIN(ratio_1s), 2) AS "RATIO-1s_MIN",
    ROUND(MAX(ratio_1s), 2) AS "RATIO-1s_MAX",
    ROUND(AVG(ratio_1s), 2) AS "RATIO-1s_AVG",
    ROUND(MIN(diff_5s), 0) AS "DIFF-5s_MIN",
    ROUND(MAX(diff_5s), 0) AS "DIFF-5s_MAX",
    ROUND(AVG(diff_5s), 0) AS "DIFF-5s_AVG",
    ROUND(MIN(ratio_5s), 2) AS "RATIO-5s_MIN",
    ROUND(MAX(ratio_5s), 2) AS "RATIO-5s_MAX",
    ROUND(AVG(ratio_5s), 2) AS "RATIO-5s_AVG"
FROM calculated_data
WHERE createdAt >= dateadd('d', -7, now())

UNION ALL

SELECT
    '1M' AS period,
    ROUND(MIN(diff_1s), 0) AS "DIFF-1s_MIN",
    ROUND(MAX(diff_1s), 0) AS "DIFF-1s_MAX",
    ROUND(AVG(diff_1s), 0) AS "DIFF-1s_AVG",
    ROUND(MIN(ratio_1s), 2) AS "RATIO-1s_MIN",
    ROUND(MAX(ratio_1s), 2) AS "RATIO-1s_MAX",
    ROUND(AVG(ratio_1s), 2) AS "RATIO-1s_AVG",
    ROUND(MIN(diff_5s), 0) AS "DIFF-5s_MIN",
    ROUND(MAX(diff_5s), 0) AS "DIFF-5s_MAX",
    ROUND(AVG(diff_5s), 0) AS "DIFF-5s_AVG",
    ROUND(MIN(ratio_5s), 2) AS "RATIO-5s_MIN",
    ROUND(MAX(ratio_5s), 2) AS "RATIO-5s_MAX",
    ROUND(AVG(ratio_5s), 2) AS "RATIO-5s_AVG"
FROM calculated_data
WHERE createdAt >= dateadd('d', -30, now())

UNION ALL

SELECT
    '1Y' AS period,
    ROUND(MIN(diff_1s), 0) AS "DIFF-1s_MIN",
    ROUND(MAX(diff_1s), 0) AS "DIFF-1s_MAX",
    ROUND(AVG(diff_1s), 0) AS "DIFF-1s_AVG",
    ROUND(MIN(ratio_1s), 2) AS "RATIO-1s_MIN",
    ROUND(MAX(ratio_1s), 2) AS "RATIO-1s_MAX",
    ROUND(AVG(ratio_1s), 2) AS "RATIO-1s_AVG",
    ROUND(MIN(diff_5s), 0) AS "DIFF-5s_MIN",
    ROUND(MAX(diff_5s), 0) AS "DIFF-5s_MAX",
    ROUND(AVG(diff_5s), 0) AS "DIFF-5s_AVG",
    ROUND(MIN(ratio_5s), 2) AS "RATIO-5s_MIN",
    ROUND(MAX(ratio_5s), 2) AS "RATIO-5s_MAX",
    ROUND(AVG(ratio_5s), 2) AS "RATIO-5s_AVG"
FROM calculated_data
WHERE createdAt >= dateadd('d', -365, now())

ORDER BY 
    CASE period
        WHEN '1D' THEN 1
        WHEN '1W' THEN 2
        WHEN '1M' THEN 3
        WHEN '1Y' THEN 4
    END;

-- 주의: 이 방법은 JSON 구조가 변경되거나 복잡해지면 작동하지 않을 수 있습니다.
-- 가장 안정적인 방법은 애플리케이션 레벨에서 처리하는 것입니다.

