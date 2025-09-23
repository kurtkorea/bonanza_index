const zmq = require("zeromq");
const { ZmqSendQueue } = require("./zmq-send-queue.js");

const { startPull } = require("./zmq-ender-pull.js");

let push = null;
let q = null;

// 초기화 함수
async function initZmq() {
  if (!push) {
    push = new zmq.Push();
    await push.bind("tcp://0.0.0.0:5557");
    q = new ZmqSendQueue(push);
  }
}

// 어디서든 겹쳐 호출해도 안전
async function send_push(topic, ts, payload) {
  try {
    if (!q) {
      await initZmq();
      // await startPull();
    }
    const payload_str = JSON.stringify(payload);
    return q.send([topic, ts, payload_str]);
  } catch (error) {
    console.error("send_push error:", error);
    // ZMQ 초기화 실패 시에도 앱이 크래시되지 않도록 에러를 무시
    return Promise.resolve();
  }
}

module.exports = {
    send_push,
    initZmq
};