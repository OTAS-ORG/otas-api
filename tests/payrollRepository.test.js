const mongoose = require('mongoose');
const connections = require('../db/connections');
const guarded = require('../repositories/guardedRepository');
jest.mock('../repositories/guardedRepository', () => ({ ...jest.requireActual('../repositories/guardedRepository'), findMany: jest.fn() }));
const payroll = require('../repositories/payrollRepository');
const ceo = { _id: new mongoose.Types.ObjectId(), username: 'fixture', roles: ['ceo_bd'] };
const employeeId = new mongoose.Types.ObjectId();
const expenseId = new mongoose.Types.ObjectId();
const newId = () => new mongoose.Types.ObjectId();
afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

for (const operation of ['list', 'get', 'unreimbursed', 'summary', 'create', 'update', 'remove']) {
  test(`developer denied ${operation} before finance connection`, async () => {
    const spy = jest.spyOn(connections, 'getConnection');
    await expect(payroll[operation]({ _id: newId(), roles: ['developer'] }, '000000000000000000000001', {})).rejects.toMatchObject({ statusCode: 403 });
    expect(spy).not.toHaveBeenCalled();
  });
}

test('salary search uses literal pattern and bounded paging', async () => {
  const filter = jest.fn();
  const query = { sort: () => query, skip: () => query, limit: () => query, lean: async () => [] };
  const salary = { find: jest.fn(q => { filter(q); return query; }), countDocuments: async () => 0 };
  jest.spyOn(connections, 'getConnection').mockResolvedValue({ models: { Salary: salary, Expense: {} } });
  const result = await payroll.list(ceo, { search: 'A.*', page: 0, limit: 900 });
  expect(result).toMatchObject({ page: 1, pages: 0, total: 0 });
  expect(filter.mock.calls[0][0].$and[1].$or[0].employeeName.$regex).toBe('A\\.\\*');
});

const fixture = expenses => {
  const session = { withTransaction: fn => fn(), endSession: jest.fn() };
  const expense = { find: jest.fn(() => ({ session: () => ({ lean: async () => expenses }) })), updateMany: jest.fn(async () => ({ matchedCount: expenses.length })) };
  const audit = { create: jest.fn(async () => []) };
  const saved = [];
  class FakeSalary {
    constructor(data) { Object.assign(this, data); this._id = newId(); this.currency ||= 'MMK'; }
    async save() { saved.push(this); }
    toObject() { return { ...this }; }
  }
  jest.spyOn(connections, 'getConnection').mockResolvedValue({ models: { Salary: FakeSalary, Expense: expense, AuditLog: audit }, startSession: async () => session });
  guarded.findMany.mockResolvedValue([]);
  return { expense, saved, session, audit };
};

test('payroll uses authoritative expense amount and writes in the same transaction', async () => {
  const { expense, saved, session, audit } = fixture([{ _id: expenseId, createdBy: employeeId, amount: 500, description: 'Taxi', currency: 'MMK', status: 'Pending' }]);
  const salary = await payroll.create(ceo, { employeeName: 'Fixture', userId: employeeId, baseSalary: 1000, month: 1, year: 2026, attachedExpenses: [{ expenseId, amount: 999999 }] });
  expect(salary.attachedExpenses[0].amount).toBe(500);
  expect(saved).toHaveLength(1);
  expect(expense.updateMany.mock.calls.every(call => call[2].session === session)).toBe(true);
  expect(audit.create).toHaveBeenCalledWith([expect.objectContaining({ clientId: saved[0]._id, user: 'fixture', action: 'PAYROLL_CREATED', details: { changedFields: [] } })], { session });
  const condition = expense.find.mock.calls[0][0].$and[1];
  expect(condition.createdBy).toEqual(employeeId);
  expect(condition.$or[0]).toEqual({ salaryId: null, isReimbursedViaPayroll: { $ne: true } });
});

test('payroll update and delete write minimal audit records in the same transaction', async () => {
  const session = { withTransaction: fn => fn(), endSession: jest.fn() };
  const salary = { _id: newId(), attachedExpenses: [], currency: 'MMK', set: jest.fn(), save: jest.fn(), deleteOne: jest.fn(), toObject() { return { _id: this._id }; } };
  const salaryModel = { findOne: jest.fn(() => ({ session: async () => salary })) };
  const expense = { updateMany: jest.fn(async () => ({ matchedCount: 0 })) };
  const audit = { create: jest.fn(async () => []) };
  jest.spyOn(connections, 'getConnection').mockResolvedValue({ models: { Salary: salaryModel, Expense: expense, AuditLog: audit }, startSession: async () => session });
  await payroll.update(ceo, salary._id.toString(), { baseSalary: 12345, notes: 'sensitive' });
  await payroll.remove(ceo, salary._id.toString());
  expect(audit.create).toHaveBeenNthCalledWith(1, [expect.objectContaining({ action: 'PAYROLL_UPDATED', details: { changedFields: ['baseSalary', 'notes'] } })], { session });
  expect(audit.create).toHaveBeenNthCalledWith(2, [expect.objectContaining({ action: 'PAYROLL_DELETED', clientId: salary._id, details: { changedFields: [] } })], { session });
  expect(salary.deleteOne).toHaveBeenCalledWith({ session });
  expect(JSON.stringify(audit.create.mock.calls)).not.toContain('12345');
  expect(JSON.stringify(audit.create.mock.calls)).not.toContain('sensitive');
});

test('failed audit write rejects payroll transaction and closes the session', async () => {
  const { audit, session } = fixture([]);
  audit.create.mockRejectedValueOnce(new Error('audit failed'));
  await expect(payroll.create(ceo, { employeeName: 'Fixture', baseSalary: 1000, month: 1, year: 2026 })).rejects.toThrow('audit failed');
  expect(session.endSession).toHaveBeenCalled();
});

test('payroll rejects inaccessible expenses, duplicate IDs and mismatched currencies before saving', async () => {
  const { saved } = fixture([{ _id: expenseId, createdBy: employeeId, amount: 500, currency: 'USD' }]);
  const common = { employeeName: 'Fixture', userId: employeeId, baseSalary: 1000, month: 1, year: 2026 };
  await expect(payroll.create(ceo, { ...common, attachedExpenses: [{ expenseId }] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  await expect(payroll.create(ceo, { ...common, attachedExpenses: [{ expenseId }, { expenseId }] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  expect(saved).toHaveLength(0);
});
