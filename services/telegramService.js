const { TelegramBot } = require('node-telegram-bot-api');
const Ticket = require('../models/Ticket');
const Task = require('../models/Task');
const Project = require('../models/Project');
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

  // Auto-set webhook on Vercel — no browser step needed
  if (process.env.NODE_ENV === 'production') {
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL ||
      (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}/api/telegram/webhook`);
    if (webhookUrl) {
      bot.setWebhook(webhookUrl).catch(err =>
        console.error('Telegram setWebhook failed:', err.message)
      );
    }
  }

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
 * Send task assignment notification to both developer and QA via Telegram.
 */
const notifyTaskAssigned = async (taskId) => {
  if (!bot) return;

  try {
    const task = await Task.findById(taskId)
      .populate('assignedTo', 'username')
      .populate('qaAssignedTo', 'username');

    if (!task) {
      console.log('Telegram notify: task not found');
      return;
    }

    const project = await Project.findById(task.projectId);
    const projectName = project?.name || 'Unknown';
    const statusLabels = { backlog: 'Backlog', todo: 'To Do', 'in-progress': 'In Progress', 'code-review': 'Code Review', 'qa-testing': 'QA Testing', done: 'Done' };
    const priorityLabels = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };

    const devButtons = ['todo', 'in-progress', 'code-review', 'done'];
    const qaButtons = ['qa-testing', 'backlog', 'done'];

    const getButtonsForRole = (role, currentStatus) => {
      const statuses = role === 'QA' ? qaButtons : devButtons;
      const buttons = [];
      for (const s of statuses) {
        if (currentStatus !== s) {
          buttons.push({ text: `🟢 ${statusLabels[s]}`, callback_data: `task:${taskId}:${s}` });
        }
      }
      return buttons;
    };

    const sendToUser = async (user, role) => {
      if (!user) return;
      const userData = await User.findById(user._id);
      if (!userData?.telegramChatId) {
        console.log(`Telegram: No linked chat for ${user.username} (${role}).`);
        return;
      }

      const roleButtons = getButtonsForRole(role, task.status);

      const message = [
        `🎫 *New Task Assigned (${role})*`,
        '',
        `*Project:* ${projectName}`,
        `*Task:* ${task.title}`,
        `*Priority:* ${priorityLabels[task.priority] || task.priority}`,
        `*Status:* ${statusLabels[task.status] || task.status}`,
        `*Assigned to:* ${task.assignedTo?.username || 'Unassigned'}`,
        task.qaAssignedTo ? `*QA:* ${task.qaAssignedTo.username}` : null,
        task.due_date ? `*Due:* ${new Date(task.due_date).toLocaleDateString()}` : null,
      ].filter(Boolean).join('\n');

      await bot.sendMessage(userData.telegramChatId, message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [roleButtons] },
      });
      console.log(`Telegram task notification sent to ${user.username} (${role}) for: ${task.title}`);
    };

    await sendToUser(task.assignedTo, 'Developer');
    await sendToUser(task.qaAssignedTo, 'QA');
  } catch (error) {
    console.error('Failed to send task Telegram notification:', error.message);
  }
};

/**
 * Process a ticket callback query (called directly from webhook route, awaited).
 */
const processTicketCallback = async (query, botInstance) => {
  const { data, message } = query;
  if (!data) return;

  const parts = data.split(':');
  if (parts.length !== 3) return;

  const ticketId = parts[1];
  const newStatus = parts[2];

  try {
    const ticket = await Ticket.findByIdAndUpdate(
      ticketId,
      { status: newStatus },
      { returnDocument: 'after' }
    )
      .populate('assigned_to', 'username')
      .populate('department_id', 'name')
      .populate('created_by', 'username');

    if (!ticket) {
      await botInstance.answerCallbackQuery(query.id, { text: '❌ Ticket not found' });
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

    await botInstance.editMessageText(updatedMessage, {
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons.length > 0 ? [buttons] : [] },
    });

    await botInstance.answerCallbackQuery(query.id, { text: `✅ Status changed to ${newStatus}` });
    console.log(`Telegram: Ticket "${ticket.title}" (${ticketId}) status changed to ${newStatus} by @${query.from.username || query.from.first_name || 'unknown'}`);

    // 🔔 Notify ticket creator about the status change
    if (ticket.created_by?._id) {
      const clickerChatId = message.chat.id;
      const creatorUser = await User.findById(ticket.created_by._id);
      if (creatorUser?.telegramChatId && creatorUser.telegramChatId !== clickerChatId.toString()) {
        const clickerName = query.from.username || query.from.first_name || 'Unknown';
        const notifyMessage = [
          '📬 *Ticket Status Updated*',
          '',
          `*Title:* ${ticket.title}`,
          `*New Status:* ${newStatus} ✅`,
          `*Updated by:* ${clickerName} (via Telegram)`,
          `*Assigned to:* ${assignedName}`,
        ].join('\n');

        await botInstance.sendMessage(creatorUser.telegramChatId, notifyMessage, {
          parse_mode: 'Markdown',
        });
        console.log(`Telegram: Notified ticket creator ${creatorUser.username} about status change to ${newStatus}`);
      }
    }
  } catch (error) {
    console.error('Error handling ticket callback query:', error);
    await botInstance.answerCallbackQuery(query.id, { text: '❌ Error updating ticket' });
  }
};

/**
 * Process a task callback query (called directly from webhook route, awaited).
 */
const processTaskCallback = async (query, botInstance) => {
  const { data, message } = query;
  if (!data) return;

  const parts = data.split(':');
  if (parts.length !== 3) return;

  const taskId = parts[1];
  const newStatus = parts[2];

  try {
    const task = await Task.findByIdAndUpdate(
      taskId,
      { status: newStatus },
      { returnDocument: 'after' }
    )
      .populate('assignedTo', 'username');

    if (!task) {
      await botInstance.answerCallbackQuery(query.id, { text: '❌ Task not found' });
      return;
    }

    const project = await Project.findById(task.projectId);
    const projectName = project?.name || 'Unknown';
    const assignedName = task.assignedTo?.username || 'Unassigned';
    const priorityLabels = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };
    const statusLabels = { backlog: 'Backlog', todo: 'To Do', 'in-progress': 'In Progress', 'code-review': 'Code Review', 'qa-testing': 'QA Testing', done: 'Done' };

    const updatedMessage = [
      '🎫 *Task Updated*',
      '',
      `*Project:* ${projectName}`,
      `*Task:* ${task.title}`,
      `*Priority:* ${priorityLabels[task.priority] || task.priority}`,
      `*Status:* ${statusLabels[newStatus] || newStatus} ✅`,
      `*Assigned to:* ${assignedName}`,
      task.due_date ? `*Due:* ${new Date(task.due_date).toLocaleDateString()}` : null,
    ].filter(Boolean).join('\n');

    const devStatuses = ['todo', 'in-progress', 'code-review', 'done'];
    const qaStatuses = ['qa-testing', 'backlog', 'done'];
    const qaOwned = ['code-review', 'qa-testing'];
    const nextRoleStatuses = qaOwned.includes(newStatus) ? qaStatuses : devStatuses;

    const buttons = [];
    for (const s of nextRoleStatuses) {
      if (newStatus !== s) {
        buttons.push({ text: `🟢 ${statusLabels[s]}`, callback_data: `task:${taskId}:${s}` });
      }
    }

    await botInstance.editMessageText(updatedMessage, {
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons.length > 0 ? [buttons] : [] },
    });

    await botInstance.answerCallbackQuery(query.id, { text: `✅ Status changed to ${statusLabels[newStatus] || newStatus}` });
    console.log(`Telegram: Task "${task.title}" (${taskId}) status changed to ${newStatus} by @${query.from.username || query.from.first_name || 'unknown'}`);
  } catch (error) {
    console.error('Error handling task callback query:', error);
    await botInstance.answerCallbackQuery(query.id, { text: '❌ Error updating task' });
  }
};

module.exports = { initBot, getBot, notifyTicketAssigned, notifyTaskAssigned, processTicketCallback, processTaskCallback };
