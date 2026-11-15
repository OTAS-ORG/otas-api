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
  const saved = [];
  class FakeSalary {
    constructor(data) { Object.assign(this, data); this._id = newId(); this.currency ||= 'MMK'; }
    async save() { saved.push(this); }
    toObject() { return { ...this }; }
  }
  jest.spyOn(connections, 'getConnection').mockResolvedValue({ models: { Salary: FakeSalary, Expense: expense }, startSession: async () => session });
  guarded.findMany.mockResolvedValue([]);
  return { expense, saved, session };
};

test('payroll uses authoritative expense amount and writes in the same transaction', async () => {
  const { expense, saved, session } = fixture([{ _id: expenseId, createdBy: employeeId, amount: 500, description: 'Taxi', currency: 'MMK', status: 'Pending' }]);
  const salary = await payroll.create(ceo, { employeeName: 'Fixture', userId: employeeId, baseSalary: 1000, month: 1, year: 2026, attachedExpenses: [{ expenseId, amount: 999999 }] });
  expect(salary.attachedExpenses[0].amount).toBe(500);
  expect(saved).toHaveLength(1);
  expect(expense.updateMany.mock.calls.every(call => call[2].session === session)).toBe(true);
  const condition = expense.find.mock.calls[0][0].$and[1];
  expect(condition.createdBy).toEqual(employeeId);
  expect(condition.$or[0]).toEqual({ salaryId: null, isReimbursedViaPayroll: { $ne: true } });
});

test('payroll rejects inaccessible expenses, duplicate IDs and mismatched currencies before saving', async () => {
  const { saved } = fixture([{ _id: expenseId, createdBy: employeeId, amount: 500, currency: 'USD' }]);
  const common = { employeeName: 'Fixture', userId: employeeId, baseSalary: 1000, month: 1, year: 2026 };
  await expect(payroll.create(ceo, { ...common, attachedExpenses: [{ expenseId }] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  await expect(payroll.create(ceo, { ...common, attachedExpenses: [{ expenseId }, { expenseId }] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  expect(saved).toHaveLength(0);
});
