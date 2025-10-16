
back-end
 1. orderbook-collector : 마켓별 호가 수집 프로세스 ( 현재는 통합 : tobe = 거래소별 분리 )
 2. ticker-collector : 마켓별 현재가 및 체결 수집 프로세스 ( 현재는 통합 : tobe = 거래소별 분리 )
 3. orderbook-storage-worker : 마켓별 호가를 ZMQ로 수신받아 QuestDB에 저장 ( ILP - Influx Line Protocol 형태로 Insert )
 4. ticker-storage-worker : 마켓별 현재가를 ZMQ로 수신받아 QuestDB에 저장 ( ILP - Influx Line Protocol 형태로 Insert )
 5. orderbook-aggregator : 각 거래소에서 호가를 수신받아 합계하는 프로세스 ( 거래소 확장을 위해 collector 와 분리 )
 6. index-calculator : orderbook-aggregator에서 수신받은 거래소별 orderbook 합산에서 index지수를 만들어 DB에 저장
 7. index-endpoint : index api end-point


flowchart LR
  subgraph EX["외부 거래소"]
    UP[Upbit WS/REST]
    BH[Bithumb WS/REST]
    BN[Binance WS/REST]
  end

  subgraph CS["CoinSpace - Realtime Platform"]
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



