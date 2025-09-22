// zmq-send-queue.js
const zmq = require("zeromq");

class ZmqSendQueue {
  constructor(sock) {
    this.sock = sock;
    this.q = [];
    this.sending = false;
  }

  send(frames) {
    return new Promise((resolve, reject) => {
      this.q.push({ frames: Array.isArray(frames) ? frames : [frames], resolve, reject });
      if (!this.sending) this.#pump();
    });
  }

  async #pump() {
    this.sending = true;
    while (this.q.length) {
      const { frames, resolve, reject } = this.q.shift();
      try {
        //직렬화
        // console.log("this.q.length", this.q.length);
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

module.exports = { ZmqSendQueue };
