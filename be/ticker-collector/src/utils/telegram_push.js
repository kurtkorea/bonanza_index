const axios = require('axios');

async function sendTelegramMessage(source_name, text, is_send = true, is_down = false) {
  // is_send가 false이거나 텔레그램 서비스 URL이 없으면 전송하지 않음

  if ( is_down ) {  
    console.log(`[Telegram] Skipped (down)`);
  }

  if (!process.env.TELEGRAM_SERVICE_URL) {
    console.log(`[Telegram] Skipped (no telegram service URL)`);
    return;
  }

  const payload = {
    source: source_name,
    content: text,
    is_send: is_send,
  }

  try {
    console.log(`[Telegram] Sending: ${ JSON.stringify(payload) }`);
    const response = await axios.post(
      process.env.TELEGRAM_SERVICE_URL || 'http://127.0.0.1:3109/v1/telegram',
      payload,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000 // 5초 타임아웃
      }
    );
    
    if (response.status === 200) {
      console.log(`[Telegram] Message sent successfully`);
    } else {
      console.error(`[Telegram] Failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    // 텔레그램 전송 실패는 앱 실행을 막지 않음
    console.error(`[Telegram] Error (continuing anyway):`, error.message);
  }
}

module.exports = {
  sendTelegramMessage,
}
