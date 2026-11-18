jest.mock('node-telegram-bot-api', () => ({ TelegramBot: jest.fn().mockImplementation(() => ({
  deleteWebHook: jest.fn().mockResolvedValue(undefined), on: jest.fn(), sendMessage: jest.fn(),
})) }));
const Task = require('../models/Task');
const Project = require('../models/Project');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

let service;
let bot;
const previousToken = process.env.TELEGRAM_BOT_TOKEN;
beforeAll(() => {
  process.env.TELEGRAM_BOT_TOKEN = 'fictional_test_token';
  service = require('../services/telegramService');
  bot = service.initBot();
});
afterAll(() => {
  if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = previousToken;
});
afterEach(() => jest.restoreAllMocks());

test('task assignment notification never queries records or sends messages', async () => {
  const task = jest.spyOn(Task, 'findById');
  const project = jest.spyOn(Project, 'findById');
  const user = jest.spyOn(User, 'findById');
  await service.notifyTaskAssigned('fictional');
  expect(task).not.toHaveBeenCalled();
  expect(project).not.toHaveBeenCalled();
  expect(user).not.toHaveBeenCalled();
  expect(bot.sendMessage).not.toHaveBeenCalled();
});

test('task callback cannot update a task or emit a message', async () => {
  const update = jest.spyOn(Task, 'findByIdAndUpdate');
  const queryBot = { sendMessage: jest.fn(), editMessageText: jest.fn(), answerCallbackQuery: jest.fn() };
  await service.processTaskCallback({ id: 'fictional', data: 'task:000000000000000000000001:done' }, queryBot);
  expect(update).not.toHaveBeenCalled();
  expect(queryBot.sendMessage).not.toHaveBeenCalled();
  expect(queryBot.editMessageText).not.toHaveBeenCalled();
  expect(queryBot.answerCallbackQuery).not.toHaveBeenCalled();
});

test('ticket callbacks retain their existing handler', async () => {
  const noTicket = { populate: () => ({ populate: () => ({ populate: async () => null }) }) };
  const find = jest.spyOn(Ticket, 'findByIdAndUpdate').mockReturnValue(noTicket);
  const queryBot = { answerCallbackQuery: jest.fn().mockResolvedValue(undefined) };
  await service.processTicketCallback({ id: 'fixture', data: 'ticket:000000000000000000000001:Pending' }, queryBot);
  expect(find).toHaveBeenCalled();
  expect(queryBot.answerCallbackQuery).toHaveBeenCalledWith('fixture', expect.objectContaining({ text: expect.stringContaining('Ticket not found') }));
});
