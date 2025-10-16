# 🪙 Bonanza index Realtime Architecture

> 거래소별 실시간 시세·호가 데이터를 수집하여 QuestDB에 저장하고,  
> 집계 지수를 산출·제공하는 실시간 데이터 파이프라인

---

## 📖 시스템 개요

Bonanza index Realtime System은 각 거래소의 WebSocket 데이터를 수집하고,  
ZeroMQ Bus로 전송하여 QuestDB에 저장한 후  
Orderbook Aggregator와 Index Calculator를 통해  
지수를 계산하고 API로 제공합니다.

---

## 🧱 1️⃣ 아키텍처 개요 (Architecture Overview)

```mermaid
flowchart LR
  subgraph EX["외부 거래소"]
    UP[Upbit WS/REST]
    BH[Bithumb WS/REST]
    BN[Binance WS/REST]
  end

  subgraph CS["Bonanza - Realtime Platform"]
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

  USER[Client / Dashboard]

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


sequenceDiagram
  participant EX1 as Exchange (e.g., Upbit)
  participant OBC as orderbook-collector-*
  participant TKC as ticker-collector-*
  participant ZOB as ZMQ orderbook-topic
  participant ZTK as ZMQ ticker-topic
  participant WOB as orderbook-storage-worker
  participant WTK as ticker-storage-worker
  participant AGG as orderbook-aggregator
  participant CAL as index-calculator
  participant QDB as QuestDB (ILP/SQL)
  participant API as index-endpoint
  participant UI as Client/Dashboard

  EX1->>OBC: WS 호가 스트림
  EX1->>TKC: WS 체결/티커 스트림

  OBC-->>ZOB: publish (symbol별)
  TKC-->>ZTK: publish (symbol별)

  ZOB-->>WOB: subscribe
  ZTK-->>WTK: subscribe
  WOB->>QDB: ILP batch insert
  WTK->>QDB: ILP batch insert

  ZOB-->>AGG: subscribe (multi-exchange)
  AGG->>CAL: 합산 orderbook 전달
  CAL->>QDB: index upsert

  UI->>API: GET /index
  API->>QDB: SQL 조회
  API-->>UI: 지수 데이터 JSON 반환
