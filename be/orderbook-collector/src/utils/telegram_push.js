
const axios = require('axios');

// 텔레그램 알림 SEND
async function sendTelegramMessage(source_name, text, is_send = true) {

  // is_send가 false이거나 텔레그램 서비스 URL이 없으면 전송하지 않음
  if (!process.env.TELEGRAM_SERVICE_URL) {
    console.log(`[Telegram] Skipped (no telegram service URL)`);
    return;
  }

  const payload = {
    source: source_name,
    content: text,
    is_send: is_send,
  }

  // 비동기로 전송하되 await하지 않아 블로킹 방지
  console.log(`[Telegram] Sending: [${source_name}] ${text}`);
  
  axios.post(
    process.env.TELEGRAM_SERVICE_URL || 'http://127.0.0.1:3109/v1/telegram',
    payload,
    {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 3000 // 3초 타임아웃
    }
  )
  .then(response => {
    if (response.status === 200) {
      logger.info(`[Telegram] Message sent successfully`);
    } else {
      v.error(`[Telegram] Failed: ${response.status} ${response.statusText}`);
    }
  })
  .catch(error => {
    // 텔레그램 전송 실패는 앱 실행을 막지 않음
    if (error.code === 'ECONNABORTED') {
      logger.error(`[Telegram] Timeout (continuing anyway): ${error.message}`);
    } else {
      logger.error(`[Telegram] Error (continuing anyway):`, error.message);
    }
  });
}

async function sendTelegramMessageQueue(source_name, text, is_send = true) {

  // is_send가 false이거나 텔레그램 서비스 URL이 없으면 전송하지 않음
  if (!process.env.TELEGRAM_SERVICE_URL) {
    console.log(`[Telegram] Skipped (no telegram service URL)`);
    return;
  }

  const payload = {
    source: source_name,
    content: text,
    is_send: is_send,
  }

  // 비동기로 전송하되 await하지 않아 블로킹 방지
  // console.log(`[Telegram] Sending: [${source_name}] ${text}`);
  
  axios.post(
    process.env.TELEGRAM_SERVICE_URL + '/queue' || 'http://127.0.0.1:3109/v1/telegram/queue',
    payload,
    {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 3000 // 3초 타임아웃
    }
  )
  .then(response => {
    if (response.status === 200) {
      console.log(`[Telegram] Message sent successfully`);
    } else {
      console.error(`[Telegram] Failed: ${response.status} ${response.statusText}`);
    }
  })
  .catch(error => {
    // 텔레그램 전송 실패는 앱 실행을 막지 않음
    if (error.code === 'ECONNABORTED') {
      console.log(`[Telegram] Timeout (continuing anyway): ${error.message}`);
    } else {
      console.error(`[Telegram] Error (continuing anyway):`, error.message);
    }
  });
}

module.exports = {
  sendTelegramMessage,
  sendTelegramMessageQueue,
}
