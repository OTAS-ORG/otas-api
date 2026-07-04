const app = require('../server');
const { connectDB } = require('../server');
const { initBot } = require('../services/telegramService');

module.exports = async (req, res) => {
  await connectDB();
  initBot(); // Initialize Telegram bot (webhook mode, idempotent)
  return app(req, res);
};
