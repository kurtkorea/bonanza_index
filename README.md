
# 시스템 구조도

```mermaid
flowchart LR
  A[orderbook-collector] --> B[ZMQ: orderbook-topic]
  B --> C[orderbook-storage-worker]
  C --> D[(QuestDB)]
