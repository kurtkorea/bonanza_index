// receiver-pull.js
const zmq = require("zeromq");

async function startPull() {

  const pull = new zmq.Pull();
  pull.connect("tcp://127.0.0.1:5557");

  // 메시지 수신 루프
  for await (const [msg, ts, payload] of pull) {
    console.log("Received:", msg.toString(), ts, JSON.parse(payload));
  }
}

module.exports = {
  startPull,
};