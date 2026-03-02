# FKBRTI 지수 계산식 문서

이 문서는 FKBRTI 지수 계산에 사용되는 모든 계산식을 설명합니다.

## 목차

1. [VWAP (Volume Weighted Average Price)](#1-vwap-volume-weighted-average-price)
2. [vwap_buy (매수 VWAP)](#2-vwap_buy-매수-vwap)
3. [vwap_sell (매도 VWAP)](#3-vwap_sell-매도-vwap)
4. [index_mid (중간 지수)](#4-index_mid-중간-지수)
5. [actual_avg (실제 평균 가격)](#5-actual_avg-실제-평균-가격)
6. [diff (차이값)](#6-diff-차이값)
7. [ratio (비율)](#7-ratio-비율)
8. [데이터 필터링 규칙](#8-데이터-필터링-규칙)
9. [provisional / no_publish](#9-provisional--no_publish)

---

## 1. VWAP (Volume Weighted Average Price)

### 기본 공식

```
VWAP = Σ(Price × Quantity) / Σ(Quantity)
```

### 코드 구현

```javascript
function vwap(levels) {
  let pq = 0, q = 0;
  for (const { price, qty } of levels) {
    if (price > 0 && qty > 0) {
      pq += price * qty;
      q += qty;
    }
  }
  return q > 0 ? pq / q : 0;
}
```

### 조건

- `price > 0`인 레벨만 포함
- `qty > 0`인 레벨만 포함
- `Σ(Quantity) = 0`이면 결과는 `0`

---

## 2. vwap_buy (매수 VWAP)

### 계산식

```
vwap_buy = Σ(매도호가 × 매도잔량) / Σ(매도잔량)
```

### 설명

- **데이터 소스**: 모든 거래소의 매도 호가(Ask) 데이터
- **정렬**: 저가 → 고가 순서로 정렬
- **Depth 제한**: 상위 N개만 사용 (기본값: 15, `DEPTH` 환경변수로 설정)
- **의미**: 매수 주문을 체결할 때 예상되는 평균 가격

### 계산 과정

1. 모든 거래소의 매도 호가 수집
2. 필터링:
   - Stale 데이터 제외 (30초 이상 지연, `STALE_MS` 환경변수로 설정)
   - 역전된 호가 제외 (bestBid > bestAsk)
   - `price > 0`, `qty > 0`인 레벨만 포함
3. 저가 → 고가로 정렬
4. 상위 N개(depth)만 선택
5. VWAP 공식 적용

### 코드 위치

- 파일: `be/index-calculator/src/service/fkbrti_engine.js`
- 라인: 209, 327

---

## 3. vwap_sell (매도 VWAP)

### 계산식

```
vwap_sell = Σ(매수호가 × 매수잔량) / Σ(매수잔량)
```

### 설명

- **데이터 소스**: 모든 거래소의 매수 호가(Bid) 데이터
- **정렬**: 고가 → 저가 순서로 정렬
- **Depth 제한**: 상위 N개만 사용 (기본값: 15)
- **의미**: 매도 주문을 체결할 때 예상되는 평균 가격

### 계산 과정

1. 모든 거래소의 매수 호가 수집
2. 필터링:
   - Stale 데이터 제외
   - 역전된 호가 제외
   - `price > 0`, `qty > 0`인 레벨만 포함
3. 고가 → 저가로 정렬
4. 상위 N개(depth)만 선택
5. VWAP 공식 적용

### 코드 위치

- 파일: `be/index-calculator/src/service/fkbrti_engine.js`
- 라인: 210, 328

---

## 4. index_mid (중간 지수)

### 계산식

```
index_mid = (vwap_buy + vwap_sell) / 2
```

### 설명

- **의미**: 매수 VWAP와 매도 VWAP의 중간값
- **용도**: FKBRTI 지수의 핵심 값으로 사용
- **반올림**: 소수점 N자리로 반올림 (기본값: 2자리, `DECIMALS` 환경변수로 설정)

### 코드 위치

- 파일: `be/index-calculator/src/service/fkbrti_engine.js`
- 라인: 211, 329

---

## 5. actual_avg (실제 평균 가격)

### 계산식

```
actual_avg = Σ(거래소_가격) / 거래소_개수
```

### 설명

- **데이터 소스**: 기대 거래소(`EXPECTED_EXCHANGES`)의 실제 가격
- **거래소 가격 결정 우선순위**:
  1. Ticker의 `close` 가격 (최신 체결가)
  2. Ticker가 없으면: `(bid1 + ask1) / 2` (매수1호가와 매도1호가의 평균)
- **필터링**: `reason == "ok"`인 거래소만 포함
  - `reason == "ok"`: 정상적인 데이터
  - 제외되는 경우:
    - `no_data`: 데이터 없음
    - `stale`: 30초 이상 지연
    - `crossed`: 역전된 호가 (bestBid > bestAsk)
    - `empty_book`: 빈 오더북

### 계산 과정

1. 각 거래소의 상태 평가 (`expected_status`)
2. `reason == "ok"`인 거래소의 가격만 수집
3. 가격이 0보다 큰 거래소만 카운트
4. 평균 계산

### 코드 위치

- 파일: `be/index-calculator/src/service/fkbrti_engine.js`
- 라인: 252-268, 338

---

## 6. diff (차이값)

### 계산식

```
diff = 거래소_가격 - index_mid
```

### 설명

- **의미**: 특정 거래소의 실제 가격과 지수 중간값의 차이
- **거래소 우선순위**:
  1. E0010001 (첫 번째 거래소)
  2. E0020001 (두 번째 거래소)
  3. E0030001 (세 번째 거래소)
  4. E0050001 (네 번째 거래소)

### 계산 과정

1. 우선순위에 따라 첫 번째 유효한 거래소 가격 선택
2. `diff = 거래소_가격 - index_mid` 계산
3. 예외 처리:
   - 모든 거래소가 `no_data`이면 `diff = 0`
   - 모든 거래소 가격이 0이면 `diff = 0`

### 코드 위치

- 파일: `be/index-calculator/src/service/fkbrti_engine.js`
- 라인: 270-296, 336

---

## 7. ratio (비율)

### 계산식

```
ratio = |diff / index_mid| × 100
```

### 설명

- **의미**: `diff`를 `index_mid`로 나눈 절댓값의 백분율
- **단위**: 퍼센트 (%)
- **용도**: 거래소 가격과 지수의 차이를 상대적으로 표현

### 계산 과정

1. `ratio = Math.abs(diff / index_mid) * 100` 계산
2. 예외 처리:
   - `no_data`이면 `ratio = 0`
   - 모든 거래소 가격이 0이면 `ratio = 0`
   - `index_mid`가 0이면 계산하지 않음 (에러 방지)

### 코드 위치

- 파일: `be/index-calculator/src/service/fkbrti_engine.js`
- 라인: 298, 337

---

## 8. 데이터 필터링 규칙

### Stale 데이터 제외

- **조건**: `timestamp < (현재시간 - STALE_MS)`
- **기본값**: 30초 (`STALE_MS=30000`)
- **의미**: 30초 이상 지연된 데이터는 사용하지 않음

### 역전된 호가 제외

- **조건**: `bestBid > bestAsk`
- **의미**: 매수 최우선 호가가 매도 최우선 호가보다 높으면 비정상 상태로 간주

### 유효한 레벨 조건

- `price > 0`
- `qty > 0`

### Depth 제한

- **기본값**: 15 (`DEPTH=15`)
- **의미**: 정렬 후 상위 N개만 사용하여 VWAP 계산

---

## 환경 변수

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `DEPTH` | 15 | VWAP 계산에 사용할 호가 레벨 수 |
| `STALE_MS` | 30000 | Stale 데이터 판단 기준 (밀리초) |
| `DECIMALS` | 2 | 반올림 소수점 자릿수 |
| `EXPECTED_EXCHANGES` | E0010001,E0020001,E0030001,E0050001 | 기대 거래소 목록 (쉼표 구분) |

---

## 계산 흐름도

```
1. 오더북 수집
   ↓
2. 데이터 필터링 (Stale, 역전, 유효성 검사)
   ↓
3. 호가 정렬 및 Depth 제한
   ↓
4. vwap_buy 계산 (매도 호가)
   ↓
5. vwap_sell 계산 (매수 호가)
   ↓
6. index_mid 계산 (중간값)
   ↓
7. 거래소 상태 평가
   ↓
8. actual_avg 계산 (거래소 평균 가격)
   ↓
9. diff 계산 (거래소 가격 - index_mid)
   ↓
10. ratio 계산 (|diff / index_mid| × 100)
    ↓
11. 반올림 및 저장
```

---

## 9. provisional / no_publish

### provisional == true 인 경우

**발생 조건 (모두 만족할 때)**

1. **기대 거래소가 하나도 유효하지 않음**  
   `expected_status`에서 `reason === "ok"`인 거래소가 하나도 없음  
   (전부 no_data / stale / crossed / empty_book).
2. **이전에 유효한 계산값이 있음**  
   `this.last`가 존재 (과거에 한 번이라도 정상 산출된 적 있음).
3. **잠정 구간 이내**  
   위 상태가 **PROV_MAX_MS(기본 60초) 이내**일 때.

**이때 동작**

- **vwap_buy, vwap_sell, index_mid**: 이번 호가로 새로 계산하지 않고 **이전 값(`this.last`)을 그대로 사용**.
- **provisional**: `true`로 저장·전파.
- **no_publish**: `false` → **DB 저장 및 ZMQ 발행 수행** (잠정치라도 계속 내보냄).
- **reason**: `"all_expected_exchanges_unavailable_or_invalid"`.

즉, “지금은 모든 기대 거래소가 쓸 수 없지만, 아직 60초 안이니까 마지막으로 믿을 수 있던 값을 잠정치로 쓴다”는 의미입니다.

### provisional == false 이면서 no_publish == true 인 경우

- 위와 같이 **기대 거래소가 전부 유효하지 않고**, 이전 값(`this.last`)은 있지만,
- **경과 시간이 PROV_MAX_MS(60초)를 초과**한 경우.

**동작**

- vwap_buy, vwap_sell, index_mid는 여전히 `this.last` 사용.
- **provisional**: `false`.
- **no_publish**: `true` → **DB에는 저장하지만 ZMQ로는 발행하지 않음** (오래된 잠정치는 더 이상 퍼뜨리지 않음).

### 이전 값도 없는 경우 (this.last 없음)

- 기대 거래소 전부 유효하지 않고, 과거 정상 산출 이력도 없을 때.
- **vwap_buy, vwap_sell, index_mid**: `null`.
- **provisional**: `false`.
- **no_publish**: `true`.
- **reason**: `"no_history_and_all_expected_unavailable_or_invalid"`.

### 요약 표

| 조건                         | provisional | no_publish | vwap_buy/sell, index_mid |
|-----------------------------|-------------|------------|---------------------------|
| 기대 거래소 중 1곳이라도 ok | false       | false      | 이번 계산값 사용          |
| 전부 무효 + 이전값 있음 + 60초 이내  | **true**    | false      | 이전값 재사용             |
| 전부 무효 + 이전값 있음 + 60초 초과 | false       | true       | 이전값 재사용(저장만)     |
| 전부 무효 + 이전값 없음     | false       | true       | null                      |

---

## 참고 사항

- 모든 계산값은 최종적으로 `roundN()` 함수로 반올림됩니다.
- `index_mid`가 0이거나 유효하지 않으면 계산을 중단합니다.
- 모든 거래소가 유효하지 않으면 `provisional` 모드로 동작합니다.
- `provisional` 모드에서는 이전 계산값을 재사용합니다 (최대 60초, `PROV_MAX_MS`).

---

## 관련 파일

- `be/index-calculator/src/service/fkbrti_engine.js`: 메인 계산 로직
- `be/orderbook-collector/src/utils/vwap.js`: VWAP 유틸리티 함수
- `be/index-calculator/src/utils/common.js`: 공통 유틸리티

---

**작성일**: 2025-01-01  
**버전**: 1.0

