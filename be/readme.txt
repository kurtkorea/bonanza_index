
back-end
 1. orderbook-collector : 마켓별 호가 수집 프로세스 ( 현재는 통합 : tobe = 거래소별 분리 )
 2. ticker-collector : 마켓별 현재가 및 체결 수집 프로세스 ( 현재는 통합 : tobe = 거래소별 분리 )
 3. orderbook-storage-worker : 마켓별 호가를 ZMQ로 수신받아 QuestDB에 저장 ( ILP - Influx Line Protocol 형태로 Insert )
 4. ticker-storage-worker : 마켓별 현재가를 ZMQ로 수신받아 QuestDB에 저장 ( ILP - Influx Line Protocol 형태로 Insert )
 5. orderbook-aggregator : 각 거래소에서 호가를 수신받아 합계하는 프로세스 ( 거래소 확장을 위해 collector 와 분리 )
 6. index-calculator : orderbook-aggregator에서 수신받은 거래소별 orderbook 합산에서 index지수를 만들어 DB에 저장
 7. index-endpoint : index api end-point
