// zmq-send-queue.js
/*
  ZMQ PUSH 방식으로 메시지를 전송하기 위한 큐
  큐가 가득 차면 가장 오래된 메시지를 버림 => 메모리 full 방지
*/

const zmq = require("zeromq");

class ZmqSendQueuePub {
  constructor(sock) {
    this.sock = sock;
    this.q = [];
    this.sending = false;
    this.maxQueueSize = process.env.PUSH_QUEUE_SIZE;
    this.dropOldestOnFull = true;
  }

  setDropOldestOnFull(dropOldest = true) {
    this.dropOldestOnFull = dropOldest;
  }

  // send 함수에서 dropOldestOnFull 옵션이 true일 때, 큐가 가득 차면 가장 오래된 메시지를 버림
  send(frames) {
    return new Promise((resolve, reject) => {
      // 소켓이 null이면 즉시 reject
      if (!this.sock) {
        reject(new Error("ZMQ socket is not initialized"));
        return;
      }

      if (this.q.length >= this.maxQueueSize) {
        if (this.dropOldestOnFull) {
          // 가장 오래된 메시지 제거 및 reject 호출
          const dropped = this.q.shift();
          if (dropped && typeof dropped.reject === "function") {
            dropped.reject(new Error("Dropped due to queue overflow"));
          }
        } else {
          reject(new Error("Queue is full"));
          return;
        }
      }
      this.q.push({ frames: Array.isArray(frames) ? frames : [frames], resolve, reject });
      if (!this.sending) this.#pump();
    });
  }

  async #pump() {
    this.sending = true;
    while (this.q.length) {
      const { frames, resolve, reject } = this.q.shift();
      try {
        if ( this.sock != null ) 
        {
          await this.sock.send(frames);
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    }
    this.sending = false;
  }
}

module.exports = { ZmqSendQueuePub };
