#!/usr/bin/env node
'use strict';

// QuestDB 디스크 용량 확인 스크립트 (Node.js 버전)

const http = require('http');
const { URL } = require('url');

// 환경 변수 설정 (기본값)
const QDB_HTTP_HOST = process.env.QDB_HTTP_HOST || process.env.QDB_HOST || '127.0.0.1';
const QDB_HTTP_PORT = parseInt(process.env.QDB_HTTP_PORT || process.env.QDB_PORT || '30091', 10);

function log(msg) {
    console.log(msg);
}

function httpRequest(query) {
    return new Promise((resolve, reject) => {
        const encodedQuery = encodeURIComponent(query);
        const url = `http://${QDB_HTTP_HOST}:${QDB_HTTP_PORT}/exec?query=${encodedQuery}`;
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            timeout: 10000
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    return;
                }
                
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    reject(new Error(`JSON 파싱 실패: ${e.message}`));
                }
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function getTables() {
    try {
        const result = await httpRequest("SELECT name, id FROM tables() ORDER BY name;");
        if (result.dataset && result.dataset.length > 0) {
            return result.dataset.map(row => row[0]);
        }
        return [];
    } catch (e) {
        log(`  오류: ${e.message}`);
        return [];
    }
}

async function getTableCount(tableName) {
    try {
        const result = await httpRequest(`SELECT count() FROM ${tableName};`);
        if (result.dataset && result.dataset.length > 0) {
            return result.dataset[0][0];
        }
        return 0;
    } catch (e) {
        return 'N/A';
    }
}

async function getTablePartitions(tableName) {
    try {
        // QuestDB는 table_partitions() 함수를 제공하지 않을 수 있으므로
        // 대신 날짜 범위를 확인하는 방법을 사용
        const result = await httpRequest(`
            SELECT min(ts) as min_ts, max(ts) as max_ts 
            FROM (
                SELECT marketAt as ts FROM ${tableName} LIMIT 1
            );
        `);
        // 간단한 정보만 반환
        return 'N/A';
    } catch (e) {
        return 'N/A';
    }
}

async function main() {
    log("==========================================");
    log("QuestDB 디스크 용량 확인");
    log("==========================================");
    log(`연결 정보: http://${QDB_HTTP_HOST}:${QDB_HTTP_PORT}`);
    log("");
    
    // 1. 테이블 목록 및 행 수 확인
    log("=== 테이블별 행 수 ===");
    const tables = await getTables();
    
    if (tables.length === 0) {
        log("  테이블을 찾을 수 없습니다.");
    } else {
        for (const table of tables) {
            const count = await getTableCount(table);
            log(`  ${table}: ${count} 행`);
        }
    }
    
    log("");
    
    // 2. 주요 테이블의 최근 데이터 확인
    log("=== 주요 테이블 최근 데이터 범위 ===");
    const mainTables = ['tb_order_book_units', 'tb_ticker', 'tb_exchange_trade', 'tb_fkbrti_1sec'];
    
    for (const table of mainTables) {
        if (tables.includes(table)) {
            try {
                // 최신 타임스탬프 확인
                const result = await httpRequest(`
                    SELECT min(marketAt) as min_ts, max(marketAt) as max_ts 
                    FROM ${table};
                `);
                if (result.dataset && result.dataset.length > 0) {
                    const row = result.dataset[0];
                    log(`  ${table}:`);
                    log(`    최소: ${row[0] || 'N/A'}`);
                    log(`    최대: ${row[1] || 'N/A'}`);
                }
            } catch (e) {
                log(`  ${table}: 정보를 가져올 수 없습니다.`);
            }
        }
    }
    
    log("");
    log("==========================================");
    log("참고: 실제 디스크 사용량은 다음 방법으로 확인하세요:");
    log("1. Kubernetes 환경:");
    log("   kubectl exec -n bonanza-index <questdb-pod> -- df -h /var/lib/questdb");
    log("   kubectl exec -n bonanza-index <questdb-pod> -- du -sh /var/lib/questdb/db/*");
    log("");
    log("2. 로컬 환경:");
    log("   du -sh /var/lib/questdb/db/*");
    log("   df -h /var/lib/questdb");
    log("==========================================");
}

main().catch((err) => {
    console.error('오류:', err.message);
    process.exit(1);
});

