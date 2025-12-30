class DataDeduplicator {
    constructor(windowMs = 1000) {
      // 타임스탬프 기반 중복 제거 윈도우 (기본 1초)
      this.windowMs = windowMs;
      // 최근 처리된 데이터 캐시 (타임스탬프 -> Set<해시>)
      this.recentData = new Map();
      // 정리 작업 인터벌
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, windowMs * 2);
    }
  
    /**
     * 데이터 중복 여부 확인
     * @param {Object} data - 수집된 데이터
     * @param {number} timestamp - 데이터 타임스탬프
     * @returns {boolean} - 중복이면 true, 아니면 false
     */
    isDuplicate(data, timestamp) {
      const windowKey = Math.floor(timestamp / this.windowMs);
      const dataHash = this.hashData(data);
  
      if (!this.recentData.has(windowKey)) {
        this.recentData.set(windowKey, new Set());
      }
  
      const windowSet = this.recentData.get(windowKey);
      
      if (windowSet.has(dataHash)) {
        return true; // 중복
      }
  
      windowSet.add(dataHash);
      return false; // 새로운 데이터
    }
  
    /**
     * 데이터 해시 생성
     * @param {Object} data - 데이터 객체
     * @returns {string} - 해시 값
     */
    hashData(data) {
      // 타임스탬프, 거래소, 상품ID, 호가 데이터를 기반으로 해시 생성
      // orderbook 데이터 구조: exchange_cd, product_id, price_id, ts, bid, ask
      const key = `${data.exchange_cd}_${data.product_id || ''}_${data.price_id || ''}_${data.ts}_${JSON.stringify(data.bid || [])}_${JSON.stringify(data.ask || [])}`;
      return require('crypto').createHash('md5').update(key).digest('hex');
    }
  
    /**
     * 오래된 윈도우 정리
     */
    cleanup() {
      const now = Date.now();
      const currentWindow = Math.floor(now / this.windowMs);
      const keepWindows = 3; // 최근 3개 윈도우 유지
  
      for (const [windowKey] of this.recentData) {
        if (windowKey < currentWindow - keepWindows) {
          this.recentData.delete(windowKey);
        }
      }
    }
  
    /**
     * 리소스 정리
     */
    destroy() {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      this.recentData.clear();
    }
  }
  
  module.exports = { DataDeduplicator };