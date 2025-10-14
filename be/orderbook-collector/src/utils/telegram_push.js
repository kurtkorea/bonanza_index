const TelegramBot = require('node-telegram-bot-api');

let system_bot_log = null;

// 텔레그램 알림 함수
function sendTelegramMessage(text) {
  if ( !system_bot_log ) {
    init_system_bot_log();
  }
  if ( process.env.TELEGRAM_IS_SEND === 'true' ) {
    system_bot_log.sendMessage(process.env.TELEGRAM_CHAT_ID, text);
  }
}

function init_system_bot_log() {
  if (!system_bot_log) {
    system_bot_log = new TelegramBot(process.env.TELEGRAM_LOG_TOKEN, { polling: true });
    system_bot_log.on('message', (msg) => {
      console.log('Chat ID:', msg.chat);
    });
  }
  return system_bot_log;
}

module.exports = {
  sendTelegramMessage,
  init_system_bot_log,
}
