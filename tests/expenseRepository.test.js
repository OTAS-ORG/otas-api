const mongoose = require('mongoose');
const connections = require('../db/connections');
const repo = require('../repositories/expenseRepository');

afterEach(() => jest.restoreAllMocks());
const id = '64a000000000000000000001';
const developer = { _id: id, roles: ['developer'] };
const ceo = { _id: id, roles: ['ceo_bd'] };

test('own expense guard is fail-closed and finance gets unscoped access', () => {
  expect(repo.scopeFor(developer).createdBy.toString()).toBe(id);
  expect(repo.scopeFor(ceo)).toEqual({});
  expect(() => repo.scopeFor({ _id: id, roles: ['unknown'] })).toThrow();
  expect(() => repo.scopeFor({ roles: ['ceo_bd'] })).toThrow();
});

test('summary always applies own creator filter before aggregation', async () => {
  const aggregate = jest.fn().mockResolvedValue([{ monthlyData: [], categoryBreakdown: [], total: [] }]);
  jest.spyOn(connections, 'getConnection').mockResolvedValue({ models: {
    Expense: { aggregate }, ExpenseCategory: {}, ExpenseDepartment: {}, AuditLog: {},
  } });
  await repo.summary(developer, 2026);
  expect(aggregate.mock.calls[0][0][0].$match.$and[0].createdBy.toString()).toBe(id);
});

test('linked payroll expenses cannot be changed or deleted', async () => {
  const doc = { salaryId: new mongoose.Types.ObjectId(), save: jest.fn(), deleteOne: jest.fn() };
  const findOne = jest.fn().mockReturnValue({ session: async () => doc });
  const session = { withTransaction: async cb => cb(), endSession: jest.fn() };
  jest.spyOn(connections, 'getConnection').mockResolvedValue({ models: {
    Expense: { findOne }, ExpenseCategory: {}, ExpenseDepartment: {}, AuditLog: {},
  }, startSession: async () => session });
  for (const result of [await repo.update(developer, id, { amount: 3 }), await repo.remove(developer, id)]) expect(result.status).toBe('linked');
  expect(findOne.mock.calls[0][0].$and[0].createdBy.toString()).toBe(id);
  expect(doc.save).not.toHaveBeenCalled(); expect(doc.deleteOne).not.toHaveBeenCalled();
});

test('unauthorized caller never obtains finance connection', async () => {
  const connect = jest.spyOn(connections, 'getConnection');
  await expect(repo.getExpenses({ _id: id, roles: ['unknown'] }, {})).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
  expect(connect).not.toHaveBeenCalled();
});

test('only CEO can delete shared expense categories', async () => {
  const connect = jest.spyOn(connections, 'getConnection');
  await expect(repo.deleteCategory(developer, id)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
  expect(connect).not.toHaveBeenCalled();
});

test('expense list scopes owners and uses fixed base user/client projections', async () => {
  const userId = new mongoose.Types.ObjectId(id), clientId = new mongoose.Types.ObjectId();
  const find = jest.fn().mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [{ createdBy: userId, clientId }] }) }) }) });
  const userFind = jest.fn().mockReturnValue({ toArray: async () => [{ _id: userId, username: 'employee' }] });
  const clientFind = jest.fn().mockReturnValue({ toArray: async () => [{ _id: clientId, companyName: 'fictional' }] });
  const base = { db: { collection: name => ({ find: name === 'users' ? userFind : clientFind }) } };
  const finance = { models: { Expense: { find, countDocuments: async () => 1 }, ExpenseCategory: {}, ExpenseDepartment: {}, AuditLog: {} } };
  jest.spyOn(connections, 'getConnection').mockImplementation(async name => name === 'finance' ? finance : base);
  const result = await repo.getExpenses(developer, {});
  expect(find.mock.calls[0][0].$and[0].createdBy.equals(userId)).toBe(true);
  expect(userFind.mock.calls[0][1]).toEqual({ projection: { _id: 1, username: 1 } });
  expect(clientFind.mock.calls[0][1]).toEqual({ projection: { _id: 1, companyName: 1 } });
  expect(result.expenses[0]).toMatchObject({ createdBy: { username: 'employee' }, clientId: { companyName: 'fictional' } });
});
