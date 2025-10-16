# 🪙 Bonanza Index Realtime Architecture

> 거래소별 실시간 시세·호가를 수집·저장하고, 집계 지수를 계산해 API로 제공하는 **Bonanza Index** 파이프라인

---

## 개요

**Bonanza Index**는 각 거래소의 WebSocket 데이터를 Collector가 받아 **ZeroMQ Bus**로 발행하고,  
Storage Worker가 **QuestDB(ILP)** 에 시계열로 적재합니다.  
적재된 호가를 **Aggregator → Index Calculator** 가 처리해 **지수**를 만들고, **API**에서 제공합니다.

---

## 구성 요소

| 모듈 | 설명 |
|---|---|
| **orderbook-collector-\*** | 거래소별 호가 수집 (Upbit/Bithumb/Binance…) |
| **ticker-collector-\*** | 거래소별 현재가·체결 수집 |
| **orderbook-storage-worker** | ZMQ 호가 구독 → QuestDB ILP 저장 |
| **ticker-storage-worker** | ZMQ 티커 구독 → QuestDB ILP 저장 |
| **orderbook-aggregator** | 거래소별 호가 합산(확장성 위해 Collector와 분리) |
| **index-calculator** | 합산 호가 기반 지수 계산/저장 |
| **index-endpoint** | 지수 조회 API (REST) |
| **QuestDB** | 시계열 DB (ILP 9009 / REST 9000 / PGWire 8812) |

---

## 1) 아키텍처 개요 (Overview)

```mermaid
flowchart LR
  subgraph EX["외부 거래소"]
    UP[Upbit WS/REST]
    BH[Bithumb WS/REST]
    BN[Binance WS/REST]
  end

  subgraph CS["Bonanza Index - Realtime Platform"]
    subgraph COL["Collectors (per Exchange)"]
      COL_OB_UP["orderbook-collector-upbit"]
      COL_TK_UP["ticker-collector-upbit"]
      COL_OB_BH["orderbook-collector-bithumb"]
      COL_TK_BH["ticker-collector-bithumb"]
      COL_OB_BN["orderbook-collector-binance"]
      COL_TK_BN["ticker-collector-binance"]
    end

    subgraph ZMQ["ZMQ Bus (PUB/SUB)"]
      Q_OB["orderbook-topic"]
      Q_TK["ticker-topic"]
    end

    W_OB["orderbook-storage-worker<br/>(ZMQ→QuestDB ILP)"]
    W_TK["ticker-storage-worker<br/>(ZMQ→QuestDB ILP)"]
    AGG["orderbook-aggregator<br/>(multi-exchange sum)"]
    CALC["index-calculator<br/>(지수 산출/저장)"]
    QDB[("(QuestDB)<br/>ILP:9009 / SQL")]
    API["index-endpoint (HTTP API)"]
  end

  USER["Client / Dashboard"]

  %% 외부 → 수집
  UP -->|호가/체결| COL_OB_UP
  UP -->|체결| COL_TK_UP
  BH --> COL_OB_BH
  BH --> COL_TK_BH
  BN --> COL_OB_BN
  BN --> COL_TK_BN

  %% 수집 → ZMQ
  COL_OB_UP -->|publish| Q_OB
  COL_OB_BH -->|publish| Q_OB
  COL_OB_BN -->|publish| Q_OB
  COL_TK_UP -->|publish| Q_TK
  COL_TK_BH -->|publish| Q_TK
  COL_TK_BN -->|publish| Q_TK

  %% ZMQ → 저장/집계
  Q_OB -->|subscribe| W_OB
  Q_TK -->|subscribe| W_TK
  W_OB -->|ILP insert| QDB
  W_TK -->|ILP insert| QDB

  %% 집계/지수
  Q_OB -. subscribe .-> AGG
  AGG --> CALC
  CALC -->|index 저장| QDB

  %% 조회
  USER -->|HTTPS| API
  API -->|SQL/REST| QDB
