"use strict";

/**
 * 큐 상태 리포트 생성 함수
 * @param {Array} clients - 거래소 클라이언트 배열
 * @returns {string} 텔레그램 리포트 문자열
 */
function generateQueueReport(clients) {
  const report = [];
  report.push("📊 큐 상태 리포트(ORDER-BOOK)");
  report.push("================================");
  report.push("");
  
  let totalQueueSize = 0;
  let totalDropped = 0;
  let totalProcessed = 0;
  let totalEnqueued = 0;
  
  clients.forEach(client => {
    const stats = client.getQueueStats();
    totalQueueSize += stats.queueSize;
    totalDropped += stats.totalDropped;
    totalProcessed += stats.totalProcessed;
    totalEnqueued += stats.totalEnqueued;
    
    const statusIcon = stats.isConnected ? "🟢" : "🔴";
    const processingIcon = stats.isProcessing ? "⚙️" : "⏸️";
    
    report.push(`${statusIcon} ${stats.exchange}`);
    report.push(`  큐: ${stats.queueSize}/${stats.queueMaxSize} (${stats.queueUsagePercent})`);
    report.push(`  처리: ${stats.totalProcessed} | 드롭: ${stats.totalDropped}`);
    // 최근 배치 처리 속도 (배치 처리에서 계산된 값)
    // lastMessagesPerSecond가 없으면 processedPerSecond를 사용, 둘 다 없으면 N/A
    const recentRate = stats.lastMessagesPerSecond > 0 
      ? `${stats.lastMessagesPerSecond.toFixed(2)} msg/s` 
      : (stats.processedPerSecond > 0 ? `${stats.processedPerSecond.toFixed(2)} msg/s` : "N/A");
    
    // 1초당 평균 큐 처리 개수 (최근 30초 평균)
    const avgPerSecondRate = stats.avgProcessedPerSecond > 0
      ? `${stats.avgProcessedPerSecond.toFixed(2)} 건/초`
      : (stats.totalProcessed > 0 ? "계산중..." : "0 건/초");
    
    // 평균 처리 속도 개선
    // processingRate는 이미 "X.XX msg/s" 형식의 문자열이므로 파싱 필요
    let avgRate = stats.processingRate;
    // "X.XX msg/s" 형식에서 숫자만 추출
    const rateMatch = avgRate.match(/([\d.]+)/);
    const avgRateNum = rateMatch ? parseFloat(rateMatch[1]) : 0;
    
    if (isNaN(avgRateNum) || avgRateNum === 0) {
      if (stats.processedPerSecond > 0) {
        avgRate = `${stats.processedPerSecond.toFixed(2)} msg/s`;
      } else if (stats.totalProcessed > 0 && stats.lastReportTime) {
        // 전체 처리 건수와 시간으로 계산 (시작 이후 평균)
        const uptimeSeconds = (Date.now() - stats.lastReportTime) / 1000;
        if (uptimeSeconds > 1) {
          avgRate = `${(stats.totalProcessed / uptimeSeconds).toFixed(2)} msg/s`;
        } else {
          avgRate = "계산중...";
        }
      } else {
        avgRate = "0.00 msg/s";
      }
    }
    // processingRate가 유효하면 그대로 사용 (이미 "X.XX msg/s" 형식)
    
    report.push(`  속도: ${avgRate} (평균) | ${recentRate} (최근)`);
    report.push(`  1초당 평균 큐 처리: ${avgPerSecondRate} | 평균 처리시간: ${stats.avgProcessingTime}`);
    report.push(`  상태: ${processingIcon} ${stats.isProcessing ? "처리중" : "대기중"}`);
    report.push("");
  });
  
  report.push("📈 전체 통계");
  report.push(`  총 큐 크기: ${totalQueueSize}`);
  report.push(`  총 처리: ${totalProcessed}`);
  report.push(`  총 드롭: ${totalDropped}`);
  report.push(`  총 추가: ${totalEnqueued}`);
  
  // 통계 스냅샷 저장 (다음 리포트를 위해)
  clients.forEach(client => {
    client.snapshotStats();
  });
  
  return report.join("\n");
}

module.exports = {
  generateQueueReport,
};

