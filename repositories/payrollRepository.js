const mongoose = require('mongoose');
const { accessibleBy } = require('@casl/mongoose');
const Salary = require('../models/Salary');
const Expense = require('../models/Expense');
const AuditLog = require('../models/AuditLog');
const { defineAbilityFor } = require('../permissions/ability');
const { authorizeCollection, findMany } = require('./guardedRepository');
const connections = require('../db/connections');
const { AppError } = require('../utils/appError');

const allowedFields = ['employeeName', 'employeeId', 'position', 'dateOfJoining', 'department', 'month', 'year', 'baseSalary', 'allowances', 'deductions', 'currency', 'exchangeRate', 'status', 'paymentChannel', 'paidDate', 'notes', 'userId', 'attachedExpenses'];
const pick = data => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError('INVALID_INPUT', 400);
  const result = Object.fromEntries(allowedFields.filter(k => Object.hasOwn(data, k)).map(k => [k, data[k]]));
  if (result.userId === '') result.userId = null;
  return result;
};
const oid = value => {
  const raw = value && typeof value === 'object' && !(value instanceof mongoose.Types.ObjectId) ? value._id : value;
  if (!mongoose.isObjectIdOrHexString(raw)) throw new AppError('INVALID_INPUT', 400);
  return new mongoose.Types.ObjectId(raw);
};
const context = async (user, action, expenseAction) => {
  const ability = defineAbilityFor(user);
  authorizeCollection({ user, ability, collection: 'salaries', action });
  if (expenseAction) authorizeCollection({ user, ability, collection: 'expenses', action: expenseAction });
  const connection = await connections.getConnection('finance');
  return { connection, ability, salary: connection.models.Salary || connection.model('Salary', Salary.schema),
    expense: connection.models.Expense || connection.model('Expense', Expense.schema),
    audit: action === 'read' ? null : (connection.models.AuditLog || connection.model('AuditLog', AuditLog.schema)) };
};
const filterFor = (ability, subject, action, filter = {}) => ({ $and: [accessibleBy(ability, action).ofType(subject), filter] });
const populate = async (user, ability, rows) => {
  const ids = [...new Set(rows.flatMap(row => [row.createdBy, row.userId]).filter(Boolean).map(String))].map(x => oid(x));
  const users = ids.length ? await findMany({ user, ability, collection: 'users', filter: { _id: { $in: ids } } }) : [];
  const byId = new Map(users.map(u => [String(u._id), u]));
  return rows.map(row => {
    const plain = typeof row.toObject === 'function' ? row.toObject() : { ...row };
    if (plain.createdBy) { const u = byId.get(String(plain.createdBy)); plain.createdBy = u ? { _id: u._id, username: u.username } : null; }
    if (plain.userId) { const u = byId.get(String(plain.userId)); plain.userId = u ? { _id: u._id, username: u.username, fullName: u.fullName } : null; }
    return plain;
  });
};
const inTransaction = async (connection, fn) => {
  const session = await connection.startSession();
  try { let result; await session.withTransaction(async () => { result = await fn(session); }); return result; }
  finally { await session.endSession(); }
};
// Record the action and changed field names only; salary values and notes stay private.
const audit = (ctx, session, user, salary, action, fields = []) => ctx.audit.create([{
  clientId: salary._id, user: user.username || 'Core Team', action,
  details: { changedFields: fields },
}], { session });
const list = async (user, query = {}) => {
  const ctx = await context(user, 'read');
  const { search, status, department, month, year } = query;
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1), limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const filter = {};
  if (status) filter.status = status;
  if (department) filter.department = department;
  if (month) filter.month = Number.parseInt(month, 10);
  if (year) filter.year = Number.parseInt(year, 10);
  if (search) {
    if (typeof search !== 'string' || search.length > 200) throw new AppError('INVALID_INPUT', 400);
    const literal = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ employeeName: { $regex: literal, $options: 'i' } }, { employeeId: { $regex: literal, $options: 'i' } }];
  }
  const scoped = filterFor(ctx.ability, 'Salary', 'read', filter);
  const [rows, total] = await Promise.all([ctx.salary.find(scoped).sort({ year: -1, month: -1 }).skip((page - 1) * limit).limit(limit).lean(), ctx.salary.countDocuments(scoped)]);
  return { salaries: await populate(user, ctx.ability, rows), total, page, pages: Math.ceil(total / limit) };
};
const get = async (user, id) => {
  const ctx = await context(user, 'read');
  if (!mongoose.isObjectIdOrHexString(id)) return null;
  const row = await ctx.salary.findOne(filterFor(ctx.ability, 'Salary', 'read', { _id: id })).lean();
  return row ? (await populate(user, ctx.ability, [row]))[0] : null;
};
const unreimbursed = async (user, userId) => {
  const ctx = await context(user, 'read', 'read');
  const id = oid(userId);
  return ctx.expense.find(filterFor(ctx.ability, 'Expense', 'read', { createdBy: id, isReimbursedViaPayroll: { $ne: true }, status: { $in: ['Pending', 'Approved'] } })).sort({ date: -1 }).lean();
};
const summary = async (user, yearInput) => {
  const ctx = await context(user, 'read');
  const year = Number.parseInt(yearInput, 10) || new Date().getFullYear();
  const scoped = filterFor(ctx.ability, 'Salary', 'read', { year });
  const sums = { count: { $sum: 1 }, totalBaseSalary: { $sum: '$baseSalary' }, totalAllowances: { $sum: '$totalAllowances' }, totalDeductions: { $sum: '$totalDeductions' }, totalNetPay: { $sum: '$netPay' } };
  const [monthlyData, totals] = await Promise.all([
    ctx.salary.aggregate([{ $match: scoped }, { $group: { _id: { month: '$month' }, ...sums } }, { $sort: { '_id.month': 1 } }]),
    ctx.salary.aggregate([{ $match: scoped }, { $group: { _id: null, ...sums } }]),
  ]);
  return { year, monthlyData, totals: totals[0] || { count: 0, totalBaseSalary: 0, totalAllowances: 0, totalDeductions: 0, totalNetPay: 0 } };
};
// Revalidate every selected expense against the employee and authoritative amounts.
const attachExpenses = async (ctx, salary, requested, session) => {
  if (!Array.isArray(requested)) throw new AppError('INVALID_INPUT', 400);
  const ids = requested.map(item => oid(item?.expenseId));
  if (new Set(ids.map(String)).size !== ids.length || (ids.length && !salary.userId)) throw new AppError('INVALID_INPUT', 400);
  const scope = filterFor(ctx.ability, 'Expense', 'update', { _id: { $in: ids }, createdBy: salary.userId, status: { $in: ['Pending', 'Approved'] }, $or: [{ salaryId: null, isReimbursedViaPayroll: { $ne: true } }, { salaryId: salary._id }] });
  const expenses = ids.length ? await ctx.expense.find(scope).session(session).lean() : [];
  if (expenses.length !== ids.length || expenses.some(e => (e.currency || 'MMK') !== (salary.currency || 'MMK'))) throw new AppError('INVALID_INPUT', 400);
  const indexed = new Map(expenses.map(e => [String(e._id), e]));
  const removeScope = filterFor(ctx.ability, 'Expense', 'update', { salaryId: salary._id, _id: { $nin: ids } });
  await ctx.expense.updateMany(removeScope, { $set: { isReimbursedViaPayroll: false, salaryId: null, reimbursedAt: null } }, { session });
  if (ids.length) {
    const result = await ctx.expense.updateMany(scope, { $set: { isReimbursedViaPayroll: true, salaryId: salary._id, status: 'Approved', reimbursedAt: new Date() } }, { session });
    if (result.matchedCount !== ids.length) throw new AppError('INVALID_INPUT', 400);
  }
  salary.attachedExpenses = ids.map(id => { const e = indexed.get(String(id)); return { expenseId: e._id, description: e.description, amount: e.amount, category: e.category, date: e.date }; });
};
const create = async (user, data) => {
  const ctx = await context(user, 'create', 'update');
  const fields = pick(data), attached = fields.attachedExpenses || [];
  delete fields.attachedExpenses;
  return inTransaction(ctx.connection, async session => {
    const salary = new ctx.salary({ ...fields, createdBy: user._id });
    await attachExpenses(ctx, salary, attached, session);
    await salary.save({ session });
    await audit(ctx, session, user, salary, 'PAYROLL_CREATED');
    return (await populate(user, ctx.ability, [salary]))[0];
  });
};
const update = async (user, id, data) => {
  const ctx = await context(user, 'update', 'update');
  if (!mongoose.isObjectIdOrHexString(id)) return null;
  const fields = pick(data);
  const changedFields = Object.keys(fields);
  return inTransaction(ctx.connection, async session => {
    const salary = await ctx.salary.findOne(filterFor(ctx.ability, 'Salary', 'update', { _id: id })).session(session);
    if (!salary) return null;
    const attached = Object.hasOwn(fields, 'attachedExpenses') ? fields.attachedExpenses : salary.attachedExpenses;
    delete fields.attachedExpenses;
    salary.set(fields);
    await attachExpenses(ctx, salary, attached, session);
    await salary.save({ session });
    await audit(ctx, session, user, salary, 'PAYROLL_UPDATED', changedFields);
    return (await populate(user, ctx.ability, [salary]))[0];
  });
};
const remove = async (user, id) => {
  const ctx = await context(user, 'delete', 'update');
  if (!mongoose.isObjectIdOrHexString(id)) return false;
  return inTransaction(ctx.connection, async session => {
    const salary = await ctx.salary.findOne(filterFor(ctx.ability, 'Salary', 'delete', { _id: id })).session(session);
    if (!salary) return false;
    await ctx.expense.updateMany(filterFor(ctx.ability, 'Expense', 'update', { salaryId: salary._id }), { $set: { isReimbursedViaPayroll: false, salaryId: null, reimbursedAt: null } }, { session });
    await salary.deleteOne({ session });
    await audit(ctx, session, user, salary, 'PAYROLL_DELETED');
    return true;
  });
};
module.exports = { list, get, unreimbursed, summary, create, update, remove };
