#!/usr/bin/env node

/**
 * 테이블을 CSV로 export하고 MinIO에 업로드하는 스크립트
 * 사용법: 
 *   - node batch.js (인자 없음: 어제 날짜, 기본 테이블명, 기본 폴더명)
 *   - node batch.js [테이블명] (어제 날짜, 지정한 테이블명, 기본 폴더명)
 *   - node batch.js [테이블명] [MinIO폴더명] (어제 날짜, 지정한 테이블명, 지정한 폴더명)
 *   - node batch.js [시작일] (지정한 날짜, 기본 테이블명, 기본 폴더명)
 *   - node batch.js [시작일] [종료일] (지정한 날짜 범위, 기본 테이블명, 기본 폴더명)
 *   - node batch.js [시작일] [종료일] [테이블명] (지정한 날짜 범위, 지정한 테이블명, 기본 폴더명)
 *   - node batch.js [시작일] [종료일] [테이블명] [MinIO폴더명] (모든 값 지정)
 * 예시: 
 *   - node batch.js (어제 날짜 사용)
 *   - node /home/dayfin/batch/batch.js tb_fkbrti_1sec fkbrti (어제 날짜, 지정한 테이블/폴더)
 *   - node /home/dayfin/batch/batch.js 2025-11-01 2025-11-30 tb_fkbrti_1sec fkbrti
 * Crontab 설정 예시:
 *   - Wrapper 스크립트 사용 (권장):
 *     1 0 * * * /home/dayfin/batch/run_batch.sh tb_fkbrti_1sec fkbrti
 *     5 0 * * * /home/dayfin/batch/run_batch.sh tb_order_book_units orderbook
 *   - 직접 node 명령어 사용:
 *     1 0 * * * cd /home/dayfin/batch && /usr/bin/node batch.js tb_fkbrti_1sec fkbrti >> /home/dayfin/batch/logs/daily_fkbrti_$(date +\%Y\%m\%d).log 2>&1
 *     5 0 * * * cd /home/dayfin/batch && /usr/bin/node batch.js tb_order_book_units orderbook >> /home/dayfin/batch/logs/daily_orderbook_$(date +\%Y\%m\%d).log 2>&1
 *   주의: crontab에서 % 문자는 \%로 이스케이프해야 합니다
*/

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { URL } = require('url');

// 환경 변수 설정 (dotenv가 있으면 사용, 없으면 건너뛰기)
try {
    require('dotenv').config({ path: path.join(__dirname, '../be/index-endpoint/env/dev.env') });
} catch (err) {
    // dotenv가 없으면 환경 변수 파일을 직접 읽기
    const envPath = path.join(__dirname, '../be/index-endpoint/env/dev.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split('\n').forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                const [key, ...valueParts] = trimmedLine.split('=');
                if (key && valueParts.length > 0) {
                    const value = valueParts.join('=').trim();
                    if (!process.env[key.trim()]) {
                        process.env[key.trim()] = value;
                    }
                }
            }
        });
    }
}

// QuestDB 설정
const QDB_HOST = process.env.QDB_HOST || 'localhost';
const QDB_PORT = process.env.QDB_PORT || '9000';

// MinIO 설정
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'http://10.40.100.11:30902';
const MINIO_ACCESS_KEY = process.env.MINIO_ROOT_USER || 'bonanza';
const MINIO_SECRET_KEY = process.env.MINIO_ROOT_PASSWORD || '56tyghbn';
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'bonanza-index';
const MINIO_REGION = process.env.MINIO_REGION || 'us-east-1';

// 테이블 설정 (기본값, 명령줄 인자로 덮어쓸 수 있음)
const DEFAULT_TABLE_NAME = 'tb_fkbrti_1sec';
const DEFAULT_MINIO_FOLDER = 'fkbrti';
const OUTPUT_DIR = path.join(__dirname, './exports');

/**
 * 어제 날짜를 YYYY-MM-DD 형식으로 반환 (로컬 시간대 기준)
 * @returns {string} 어제 날짜 (YYYY-MM-DD)
 */
function getYesterdayDate() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    // 로컬 시간대 기준으로 날짜 포맷팅 (toISOString()은 UTC 기준이므로 사용하지 않음)
    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 테이블별 타임스탬프 컬럼 매핑
const TABLE_TIMESTAMP_COLUMNS = {
    'tb_order_book_units': 'ts',
    'tb_fkbrti_1sec': 'createdAt',
    'tb_exchange_trade': 'marketAt'
};

/**
 * 테이블명에 해당하는 타임스탬프 컬럼 반환
 */
function getTimestampColumn(tableName) {
    return TABLE_TIMESTAMP_COLUMNS[tableName] || 'createdAt';
}

// 색상 출력을 위한 유틸리티
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    brightWhite: '\x1b[97m',
    brightCyan: '\x1b[96m',
    magenta: '\x1b[35m',
};

function log(color, message) {
    console.log(`${colors[color] || ''}${message}${colors.reset}`);
}

/**
 * QuestDB에서 CSV 데이터를 파일로 직접 다운로드 (스트림 방식)
 * 큰 파일 처리를 위해 메모리에 로드하지 않고 직접 파일로 저장
 */
async function downloadCSV(startDate, endDate, tableName, outputFile) {
    return new Promise((resolve, reject) => {
        const timestampColumn = getTimestampColumn(tableName);
        let whereClause = `${timestampColumn} >= '${startDate} 00:00:00' AND ${timestampColumn} < '${endDate} 23:59:59'`;
        if (tableName === 'tb_order_book_units') {
            whereClause += ' AND size > 0';
        }
        const query = `SELECT * FROM ${tableName} WHERE ${whereClause} ORDER BY ${timestampColumn} ASC`;
        const queryEncoded = encodeURIComponent(query);
        const url = `http://${QDB_HOST}:${QDB_PORT}/exp?query=${queryEncoded}`;

        log('cyan', 'QuestDB에서 데이터 다운로드 중...');
        log('white', 'URL: ' + url);

        http.get(url, {
            headers: {
                'Accept': 'text/csv'
            },
            timeout: 3000000 // 50분 타임아웃
        }, (res) => {
            if (res.statusCode !== 200) {
                let errorBody = '';
                res.on('data', (chunk) => {
                    if (chunk) {
                        errorBody += chunk.toString();
                    }
                });
                res.on('end', () => {
                    const errorMsg = 'QuestDB 요청 실패: HTTP ' + res.statusCode + (errorBody ? ' - ' + errorBody.substring(0, 500) : '');
                    log('red', 'QuestDB 에러 응답: ' + errorBody.substring(0, 500));
                    reject(new Error(errorMsg));
                });
                return;
            }

            // 스트림 방식으로 파일에 직접 쓰기 (메모리 절약)
            const writeStream = fs.createWriteStream(outputFile);
            let totalBytes = 0;
            let hasData = false;

            res.on('data', (chunk) => {
                if (chunk && chunk.length > 0) {
                    hasData = true;
                    totalBytes += chunk.length;
                    writeStream.write(chunk);
                }
            });

            res.on('end', () => {
                writeStream.end();
                if (!hasData) {
                    try {
                        if (fs.existsSync(outputFile)) {
                            fs.unlinkSync(outputFile);
                        }
                    } catch (e) {
                        // 파일 삭제 실패는 무시
                    }
                    reject(new Error('다운로드된 데이터가 비어있습니다.'));
                    return;
                }
                const fileSizeMB = (totalBytes / 1024 / 1024).toFixed(2);
                log('green', 'CSV 다운로드 완료: ' + outputFile + ' (' + fileSizeMB + ' MB)');
                resolve(outputFile);
            });

            res.on('error', (err) => {
                writeStream.destroy();
                try {
                    if (fs.existsSync(outputFile)) {
                        fs.unlinkSync(outputFile);
                    }
                } catch (e) {
                    // 파일 삭제 실패는 무시
                }
                reject(new Error('QuestDB 응답 스트림 오류: ' + (err.message || String(err))));
            });

            writeStream.on('error', (err) => {
                reject(new Error('파일 쓰기 오류: ' + (err.message || String(err))));
            });
        }).on('error', (err) => {
            reject(new Error('QuestDB 연결 오류: ' + (err.message || String(err))));
        }).on('timeout', () => {
            reject(new Error('QuestDB 요청 타임아웃'));
        });
    });
}

/**
 * CSV 파일을 gzip으로 압축 (스트림 방식)
 */
async function compressCSV(inputFile, outputPath) {
    return new Promise((resolve, reject) => {
        const gzip = zlib.createGzip();
        const readStream = fs.createReadStream(inputFile);
        const writeStream = fs.createWriteStream(outputPath);

        readStream
            .pipe(gzip)
            .pipe(writeStream)
            .on('finish', () => {
                const stats = fs.statSync(outputPath);
                log('green', '압축 완료: ' + outputPath + ' (' + (stats.size / 1024 / 1024).toFixed(2) + ' MB)');
                resolve(outputPath);
            })
            .on('error', (err) => {
                reject(new Error('압축 오류: ' + (err.message || String(err))));
            });

        readStream.on('error', (err) => {
            reject(new Error('파일 읽기 오류: ' + (err.message || String(err))));
        });
    });
}

/**
 * 날짜에서 년-월 추출 (YYYY-MM 형식)
 * @param {string} dateStr - YYYY-MM-DD 형식의 날짜 문자열
 * @returns {string} YYYY-MM 형식의 년-월 문자열
 */
function getYearMonth(dateStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        // 날짜 형식이 올바르지 않으면 현재 날짜의 년-월 사용
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }
    // YYYY-MM-DD에서 YYYY-MM 추출
    return dateStr.substring(0, 7);
}

/**
 * MinIO에 파일 업로드 (minio 라이브러리 우선 사용)
 * @param {string} filePath - 업로드할 파일 경로
 * @param {string} objectName - MinIO 객체명
 * @param {string} minioFolder - MinIO 폴더명
 * @param {string} dateStr - 날짜 문자열 (YYYY-MM-DD) - 월 폴더 생성용
 */
async function uploadToMinIO(filePath, objectName, minioFolder, dateStr) {
    return new Promise((resolve, reject) => {
        // minio 라이브러리를 먼저 시도 (Node.js 버전 호환성 문제로 인해)
        try {
            const Minio = require('minio');
            const url = new URL(MINIO_ENDPOINT);

            const minioClient = new Minio.Client({
                endPoint: url.hostname,
                port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
                useSSL: url.protocol === 'https:',
                accessKey: MINIO_ACCESS_KEY,
                secretKey: MINIO_SECRET_KEY,
            });

            const fileName = path.basename(filePath);
            // 월 폴더 생성: minioFolder/YYYY-MM/파일명
            const yearMonth = getYearMonth(dateStr);
            const objectPath = minioFolder + '/' + yearMonth + '/' + (objectName || fileName);

            log('cyan', 'MinIO에 업로드 중: ' + objectPath + '...');

            minioClient.fPutObject(
                MINIO_BUCKET,
                objectPath,
                filePath,
                {
                    'Content-Type': 'application/gzip',
                },
                (err) => {
                    if (err) {
                        log('red', '❌ 업로드 실패: ' + (err.message || String(err)));
                        reject(err);
                    } else {
                        log('green', '✅ 업로드 완료: ' + objectPath);
                        resolve(objectPath);
                    }
                }
            );
        } catch (err) {
            // minio 라이브러리가 없거나 오류가 발생하면 @aws-sdk/client-s3 시도
            if (err.code === 'MODULE_NOT_FOUND') {
                log('yellow', '⚠️  minio 라이브러리가 없습니다. @aws-sdk/client-s3를 시도합니다...');
                uploadToMinIOWithS3SDK(filePath, objectName, minioFolder, dateStr)
                    .then(resolve)
                    .catch(reject);
            } else {
                reject(new Error('MinIO 클라이언트 초기화 실패: ' + (err.message || String(err))));
            }
        }
    });
}

/**
 * AWS S3 SDK를 사용한 MinIO 업로드 (Node.js 14+ 필요)
 * @param {string} filePath - 업로드할 파일 경로
 * @param {string} objectName - MinIO 객체명
 * @param {string} minioFolder - MinIO 폴더명
 * @param {string} dateStr - 날짜 문자열 (YYYY-MM-DD) - 월 폴더 생성용
 */
async function uploadToMinIOWithS3SDK(filePath, objectName, minioFolder, dateStr) {
    return new Promise((resolve, reject) => {
        try {
            const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
            
            const s3Client = new S3Client({
                endpoint: MINIO_ENDPOINT,
                region: MINIO_REGION,
                credentials: {
                    accessKeyId: MINIO_ACCESS_KEY,
                    secretAccessKey: MINIO_SECRET_KEY,
                },
                forcePathStyle: true, // MinIO는 path-style URL 사용
            });

            const fileContent = fs.readFileSync(filePath);
            const fileName = path.basename(filePath);
            // 월 폴더 생성: minioFolder/YYYY-MM/파일명
            const yearMonth = getYearMonth(dateStr);
            const objectPath = minioFolder + '/' + yearMonth + '/' + (objectName || fileName);

            log('cyan', 'MinIO에 업로드 중: ' + objectPath + '...');

            const command = new PutObjectCommand({
                Bucket: MINIO_BUCKET,
                Key: objectPath,
                Body: fileContent,
                ContentType: 'application/gzip',
            });

            s3Client.send(command)
                .then(() => {
                    log('green', '✅ 업로드 완료: ' + objectPath);
                    resolve(objectPath);
                })
                .catch((err) => {
                    log('red', '❌ 업로드 실패: ' + (err.message || String(err)));
                    reject(err);
                });
        } catch (err) {
            reject(new Error('AWS S3 SDK 초기화 실패: ' + (err.message || String(err))));
        }
    });
}


/**
 * 날짜 범위를 일별로 분할하여 처리
 */
async function processDateRange(startDate, endDate, tableName, minioFolder) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // 출력 디렉토리 생성
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const results = {
        success: 0,
        failed: 0,
        files: []
    };

    // 일별로 처리
    let currentDate = new Date(start);
    let dayIndex = 0;

    while (currentDate <= end) {
        dayIndex++;
        const currentDateStr = currentDate.toISOString().split('T')[0];
        const nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextDateStr = nextDate.toISOString().split('T')[0];

        log('cyan', '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('white', '[' + dayIndex + '] ' + currentDateStr + ' 처리 중...');

        try {
            // 파일명 생성
            const dateString = currentDateStr.replace(/-/g, '');
            const csvFile = path.join(OUTPUT_DIR, tableName + '_' + dateString + '.csv');
            const gzFile = path.join(OUTPUT_DIR, tableName + '_' + dateString + '.csv.gz');

            // CSV 다운로드 (스트림 방식으로 직접 파일에 저장 - 메모리 절약)
            await downloadCSV(currentDateStr, nextDateStr, tableName, csvFile);

            // gzip 압축 (스트림 방식)
            await compressCSV(csvFile, gzFile);

            // MinIO 업로드 (월 폴더 자동 생성)
            const objectName = tableName + '_' + dateString + '.csv.gz';
            const yearMonth = getYearMonth(currentDateStr);
            const uploadedPath = await uploadToMinIO(gzFile, objectName, minioFolder, currentDateStr);

            // 원본 CSV 파일 삭제
            if (fs.existsSync(csvFile)) {
                fs.unlinkSync(csvFile);
                log('green', 'CSV 파일 삭제 완료: ' + csvFile);
            }

            // MinIO 업로드 후 .gz 파일 삭제
            if (fs.existsSync(gzFile)) {
                fs.unlinkSync(gzFile);
                log('green', '압축 파일 삭제 완료: ' + gzFile);
            }

            results.success++;
            results.files.push({
                date: currentDateStr,
                object: uploadedPath
            });

            log('green', '✅ ' + currentDateStr + ' 처리 완료');
        } catch (err) {
            const errorMsg = err.message || String(err);
            log('red', '❌ ' + currentDateStr + ' 처리 실패: ' + errorMsg);
            if (err.stack) {
                log('yellow', '스택 트레이스: ' + err.stack);
            }
            results.failed++;
        }

        // 다음 날로 이동
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return results;
}

/**
 * 메인 함수
 */
async function main() {
    // 인자 확인
    const args = process.argv.slice(2);
    let startDate, endDate, tableName, minioFolder;

    // 인자 파싱
    // 날짜 형식 체크 함수 (YYYY-MM-DD)
    const isDateFormat = (str) => /^\d{4}-\d{2}-\d{2}$/.test(str);
    
    if (args.length >= 4) {
        // 4개 이상: [시작일] [종료일] [테이블명] [MinIO폴더명]
        startDate = args[0];
        endDate = args[1];
        tableName = args[2];
        minioFolder = args[3];
    } else if (args.length === 3) {
        // 3개: 첫 번째가 날짜인지 확인
        if (isDateFormat(args[0])) {
            // [시작일] [종료일] [테이블명]
            startDate = args[0];
            endDate = args[1];
            tableName = args[2];
            minioFolder = DEFAULT_MINIO_FOLDER;
        } else {
            // [테이블명] [MinIO폴더명] [기타] - 어제 날짜 사용
            const yesterday = getYesterdayDate();
            startDate = yesterday;
            endDate = yesterday;
            tableName = args[0];
            minioFolder = args[1];
        }
    } else if (args.length === 2) {
        // 2개: 첫 번째가 날짜인지 확인
        if (isDateFormat(args[0])) {
            // [시작일] [종료일] - 어제 날짜가 아님
            startDate = args[0];
            endDate = args[1];
            tableName = DEFAULT_TABLE_NAME;
            minioFolder = DEFAULT_MINIO_FOLDER;
        } else {
            // [테이블명] [MinIO폴더명] - 어제 날짜 사용
            const yesterday = getYesterdayDate();
            startDate = yesterday;
            endDate = yesterday;
            tableName = args[0];
            minioFolder = args[1];
            
            // 디버그: 날짜 설정 확인
            if (process.env.DEBUG === 'true') {
                console.log('[DEBUG] 어제 날짜 설정:', { startDate, endDate, tableName, minioFolder });
            }
        }
    } else if (args.length === 1) {
        // 1개: 날짜인지 테이블명인지 확인
        if (isDateFormat(args[0])) {
            // [시작일] - 해당 날짜만 처리
            startDate = args[0];
            endDate = args[0];
            tableName = DEFAULT_TABLE_NAME;
            minioFolder = DEFAULT_MINIO_FOLDER;
        } else {
            // [테이블명] - 어제 날짜 사용, 기본 폴더명
            const yesterday = getYesterdayDate();
            startDate = yesterday;
            endDate = yesterday;
            tableName = args[0];
            minioFolder = DEFAULT_MINIO_FOLDER;
        }
    } else {
        // 인자가 없으면 어제 날짜 사용 (기본값)
        const yesterday = getYesterdayDate();
        startDate = yesterday;
        endDate = yesterday;
        tableName = DEFAULT_TABLE_NAME;
        minioFolder = DEFAULT_MINIO_FOLDER;
    }

    // 날짜 형식 검증
    if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        log('red', '❌ 날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식을 사용하세요.');
        log('red', `   startDate: ${startDate || '(undefined)'}`);
        log('red', `   endDate: ${endDate || '(undefined)'}`);
        log('yellow', '사용법:');
        log('yellow', '  - node batch.js (인자 없음: 어제 날짜, 기본 테이블명, 기본 폴더명)');
        log('yellow', '  - node batch.js [테이블명] (어제 날짜, 지정한 테이블명, 기본 폴더명)');
        log('yellow', '  - node batch.js [테이블명] [MinIO폴더명] (어제 날짜, 지정한 테이블명, 지정한 폴더명)');
        log('yellow', '  - node batch.js [시작일] [종료일] [테이블명] [MinIO폴더명] (모든 값 지정)');
        log('yellow', '예시:');
        log('yellow', '  - node batch.js (어제 날짜 사용)');
        log('yellow', '  - node batch.js tb_fkbrti_1sec fkbrti (어제 날짜, 지정한 테이블/폴더)');
        log('yellow', '  - node batch.js 2025-11-01 2025-11-30 tb_fkbrti_1sec fkbrti');
        process.exit(1);
    }

    log('cyan', '==========================================');
    log('cyan', '  CSV Export & MinIO Upload');
    log('cyan', '==========================================');
    log('white', 'QuestDB: http://' + QDB_HOST + ':' + QDB_PORT);
    log('white', 'MinIO: ' + MINIO_ENDPOINT);
    log('white', 'Bucket: ' + MINIO_BUCKET);
    log('white', 'Table: ' + tableName);
    log('white', 'Folder: ' + minioFolder);
    log('white', '기간: ' + startDate + ' ~ ' + endDate);
    log('cyan', '==========================================\n');

    try {
        const results = await processDateRange(startDate, endDate, tableName, minioFolder);

        // 결과 요약
        log('cyan', '\n==========================================');
        log('cyan', '  처리 완료');
        log('cyan', '==========================================');
        log('green', '성공: ' + results.success);
        log('red', '실패: ' + results.failed);
        log('cyan', '==========================================\n');

        if (results.failed === 0) {
            log('green', '✅ 모든 파일이 성공적으로 처리되었습니다.');
            process.exit(0);
        } else {
            log('yellow', '⚠️  일부 파일 처리에 실패했습니다.');
            process.exit(1);
        }
    } catch (err) {
        log('red', '❌ 오류 발생: ' + (err.message || String(err)));
        console.error(err);
        process.exit(1);
    }
}

// 스크립트 실행
if (require.main === module) {
    main().catch((err) => {
        log('red', '❌ 치명적 오류: ' + (err.message || String(err)));
        console.error(err);
        process.exit(1);
    });
}

module.exports = { processDateRange, downloadCSV, compressCSV, uploadToMinIO, getYearMonth, DEFAULT_TABLE_NAME, DEFAULT_MINIO_FOLDER };

