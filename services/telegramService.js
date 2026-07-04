const { TelegramBot } = require('node-telegram-bot-api');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

let bot = null;

/**
 * Initialize the Telegram bot in webhook mode (polling: false).
 * Called once per cold start on Vercel, idempotent on warm starts.
 * Registers callback query handler for inline ticket status buttons.
 */
const initBot = () => {
  if (!TOKEN) {
    console.log('Telegram bot disabled (no TELEGRAM_BOT_TOKEN set)');
    return null;
  }

  // Prevent re-initialization on warm Vercel invocations
  if (bot) return bot;

  bot = new TelegramBot(TOKEN, { polling: false });
  console.log('Telegram bot initialized (webhook mode)');

  // Register callback handler at module level — persists across warm starts
  registerCallbackHandler();
  return bot;
};

/**
 * Get the current bot instance (used by webhook route to call processUpdate).
 */
const getBot = () => bot;

/**
 * Send ticket assignment notification to the assigned user's Telegram.
 * Looks up the assigned user's telegramChatId from the User model.
 */
const notifyTicketAssigned = async (ticketId) => {
  if (!bot) return;

  try {
    const ticket = await Ticket.findById(ticketId)
      .populate('assigned_to', 'username')
      .populate('department_id', 'name')
      .populate('created_by', 'username');

    if (!ticket || !ticket.assigned_to) {
      console.log('Telegram notify: ticket or assigned user not found');
      return;
    }

    // Look up the assigned user's linked Telegram chat ID
    const assignedUser = await User.findById(ticket.assigned_to._id);
    if (!assignedUser?.telegramChatId) {
      console.log(`Telegram: No linked chat for ${ticket.assigned_to.username}. They must send /start ${ticket.assigned_to.username} to the bot first.`);
      return;
    }

    const chatId = assignedUser.telegramChatId;
    const assignedName = ticket.assigned_to.username;
    const deptName = ticket.department_id?.name || 'No department';

    const message = [
      '🎫 *New Ticket Assigned*',
      '',
      `*Title:* ${ticket.title}`,
      `*Description:* ${ticket.description}`,
      `*Priority:* ${ticket.priority}`,
      `*Status:* ${ticket.status}`,
      `*Assigned to:* ${assignedName}`,
      `*Department:* ${deptName}`,
      `*Created by:* ${ticket.created_by?.username || 'Unknown'}`,
    ].join('\n');

    const buttons = [];
    if (ticket.status !== 'In Progress') {
      buttons.push({ text: '🟡 In Progress', callback_data: `ticket:${ticketId}:In Progress` });
    }
    if (ticket.status !== 'Resolved') {
      buttons.push({ text: '✅ Resolved', callback_data: `ticket:${ticketId}:Resolved` });
    }
    if (ticket.status !== 'Pending') {
      buttons.push({ text: '⏸ Pending', callback_data: `ticket:${ticketId}:Pending` });
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [buttons] },
    });
    console.log(`Telegram notification sent to ${assignedName} for ticket: ${ticket.title}`);
  } catch (error) {
    console.error('Failed to send Telegram notification:', error.message);
  }
};

/**
 * Handle inline button clicks from Telegram.
 * Callback data format: "ticket:{ticketId}:{newStatus}"
 * In webhook mode, triggered via bot.processUpdate(req.body) in the webhook route.
 */
const registerCallbackHandler = () => {
  if (!bot) return;

  bot.on('callback_query', async (query) => {
    const { data, message } = query;
    if (!data || !data.startsWith('ticket:')) return;

    const parts = data.split(':');
    if (parts.length !== 3) return;

    const ticketId = parts[1];
    const newStatus = parts[2];

    try {
      const ticket = await Ticket.findByIdAndUpdate(
        ticketId,
        { status: newStatus },
        { new: true }
      )
        .populate('assigned_to', 'username')
        .populate('department_id', 'name')
        .populate('created_by', 'username');

      if (!ticket) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Ticket not found' });
        return;
      }

      const assignedName = ticket.assigned_to?.username || 'Unassigned';
      const deptName = ticket.department_id?.name || 'No department';

      const updatedMessage = [
        '🎫 *Ticket Updated*',
        '',
        `*Title:* ${ticket.title}`,
        `*Description:* ${ticket.description}`,
        `*Priority:* ${ticket.priority}`,
        `*Status:* ${newStatus} ✅`,
        `*Assigned to:* ${assignedName}`,
        `*Department:* ${deptName}`,
        `*Created by:* ${ticket.created_by?.username || 'Unknown'}`,
      ].join('\n');

      const buttons = [];
      if (newStatus !== 'In Progress') {
        buttons.push({ text: '🟡 In Progress', callback_data: `ticket:${ticketId}:In Progress` });
      }
      if (newStatus !== 'Resolved') {
        buttons.push({ text: '✅ Resolved', callback_data: `ticket:${ticketId}:Resolved` });
      }
      if (newStatus !== 'Pending') {
        buttons.push({ text: '⏸ Pending', callback_data: `ticket:${ticketId}:Pending` });
      }

      await bot.editMessageText(updatedMessage, {
        chat_id: message.chat.id,
        message_id: message.message_id,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons.length > 0 ? [buttons] : [] },
      });

      await bot.answerCallbackQuery(query.id, { text: `✅ Status changed to ${newStatus}` });
    } catch (error) {
      console.error('Error handling callback query:', error);
      await bot.answerCallbackQuery(query.id, { text: '❌ Error updating ticket' });
    }
  });
};

module.exports = { initBot, getBot, notifyTicketAssigned };
