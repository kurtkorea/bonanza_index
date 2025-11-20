const TelegramBot = require('node-telegram-bot-api');
const { db } = require('../db/db.js');

let system_bot_log = null;
let system_bot_log_queue = null;

// 텔레그램 알림 함수
async function sendTelegramMessageSource(source_name, text, is_send = true) {
  
  if ( !system_bot_log ) {
    init_system_bot_log();
  }

  const log_data = {
    source: source_name,
    content: text,
  }

  await db.sequelize.query(
    `INSERT INTO tb_system_log (content, createdAt) VALUES (?, NOW())`,
    {
      replacements: [ JSON.stringify(log_data) ],
      type: db.sequelize.QueryTypes.INSERT,
    }
  );

  if ( is_send ) {
    if ( process.env.TELEGRAM_LOG_IS_SEND === 'true' ) {
      try {
        // 비동기로 전송하되 await하지 않아 타임아웃 방지
        system_bot_log?.sendMessage(process.env.TELEGRAM_LOG_CHAT_ID, text)
          .catch(err => {
            console.error('[Telegram] Send error:', err.message);
          });
      } catch (err) {
        console.error('[Telegram] Error:', err.message);
      }
    }
  }
}

async function sendTelegramMessageQueue(source_name, text, is_send = true) {
  
  if ( !system_bot_log_queue ) {
    init_system_bot_log_queue();
  }

  if ( is_send ) {
    if ( process.env.TELEGRAM_STATUS_LOG_IS_SEND === 'true' ) {
      try {
        // 비동기로 전송하되 await하지 않아 타임아웃 방지
        system_bot_log_queue?.sendMessage(process.env.TELEGRAM_STATUS_LOG_CHAT_ID, text)
          .catch(err => {
            console.error('[Telegram Queue] Send error:', err.message);
          });
      } catch (err) {
        console.error('[Telegram Queue] Error:', err.message);
      }
    }
  }
}

function init_system_bot_log() {
  if (!system_bot_log) {
    console.log("[TELEGRAM LOG PUSH] init_system_bot_log");
    // polling: false - 메시지 전송만 하므로 polling 불필요 (여러 인스턴스 충돌 방지)
    system_bot_log = new TelegramBot(process.env.TELEGRAM_LOG_TOKEN, { polling: false });
  }
  return system_bot_log;
}

function init_system_bot_log_queue() {
  if (!system_bot_log_queue) {
    console.log("[TELEGRAM LOG PUSH] init_system_bot_log_queue");
    // polling: false - 메시지 전송만 하므로 polling 불필요 (여러 인스턴스 충돌 방지)
    system_bot_log_queue = new TelegramBot(process.env.TELEGRAM_STATUS_LOG_TOKEN, { polling: false });
  }
  return system_bot_log_queue;
}

module.exports = {
  sendTelegramMessageSource,
  sendTelegramMessageQueue,
  init_system_bot_log,
  init_system_bot_log_queue,
}
