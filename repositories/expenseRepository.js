const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const ExpenseCategory = require('../models/ExpenseCategory');
const ExpenseDepartment = require('../models/ExpenseDepartment');
const AuditLog = require('../models/AuditLog');
const { ROLES } = require('../permissions/roles');
const { seesFinance } = require('../permissions/moneyClasses');
const { AppError } = require('../utils/appError');
const connections = require('../db/connections');

// Own claims are an explicit row-scoped exception to the finance money class.
// MongoDB roles cannot enforce per-application-user rows: all own-claim queries
// are therefore constrained here and no finance connection escapes this module.
const scopeFor = user => {
  if (!user?._id || !mongoose.isObjectIdOrHexString(user._id) ||
      !Array.isArray(user.roles) || !user.roles.some(role => ROLES.includes(role)))
    throw new AppError('NOT_AUTHORIZED', 403);
  return seesFinance(user) ? {} : { createdBy: new mongoose.Types.ObjectId(user._id.toString()) };
};
const context = async user => {
  const scope = scopeFor(user);
  const connection = await connections.getConnection('finance');
  const model = (name, schema) => connection.models[name] || connection.model(name, schema);
  return { scope, connection, model: model('Expense', Expense.schema),
    category: model('ExpenseCategory', ExpenseCategory.schema),
    department: model('ExpenseDepartment', ExpenseDepartment.schema),
    audit: model('AuditLog', AuditLog.schema) };
};
const safeId = id => mongoose.isObjectIdOrHexString(id) ? new mongoose.Types.ObjectId(id.toString()) : null;
const scoped = (scope, filter) => ({ $and: [scope, filter] });
// Resolve only references on already-authorized rows, with fixed projections.
const enrich = async (rows, detail = false) => {
  if (!rows.length) return rows;
  const base = await connections.getConnection('none');
  const clientIds = rows.map(x => x.clientId).filter(Boolean);
  const userIds = rows.map(x => x.createdBy).filter(Boolean);
  const [clients, users] = await Promise.all([
    clientIds.length ? base.db.collection('clients').find({ _id: { $in: clientIds } },
      { projection: detail ? { _id: 1, companyName: 1, contactPerson: 1 } : { _id: 1, companyName: 1 } }).toArray() : [],
    userIds.length ? base.db.collection('users').find({ _id: { $in: userIds } },
      { projection: { _id: 1, username: 1 } }).toArray() : [],
  ]);
  const byId = records => new Map(records.map(record => [record._id.toString(), record]));
  const clientsById = byId(clients), usersById = byId(users);
  return rows.map(doc => ({ ...doc, ...(doc.clientId ? { clientId: clientsById.get(doc.clientId.toString()) || null } : {}),
    ...(doc.createdBy ? { createdBy: usersById.get(doc.createdBy.toString()) || null } : {}) }));
};
const transaction = async (connection, run) => {
  const session = await connection.startSession();
  try { let result; await session.withTransaction(async () => { result = await run(session); }); return result; }
  finally { await session.endSession(); }
};
const fields = ['description', 'amount', 'currency', 'exchangeRate', 'category', 'department', 'paymentMethod', 'clientId', 'notes', 'date'];
const sanitize = data => {
  const result = {};
  for (const field of fields) if (data[field] !== undefined) result[field] = data[field];
  if (!result.clientId) delete result.clientId;
  return result;
};
const ensureTaxonomy = async (ctx, data, user, session) => {
  if (data.category) await ctx.category.updateOne({ name: data.category }, { $setOnInsert: { name: data.category, createdBy: user._id } }, { upsert: true, session });
  if (data.department) await ctx.department.updateOne({ name: data.department }, { $setOnInsert: { name: data.department, createdBy: user._id } }, { upsert: true, session });
};
const writeAudit = (ctx, session, user, expense, action, data) => ctx.audit.create([{ clientId: expense._id, action,
  details: { description: data.description, amount: data.amount, category: data.category }, user: user.username || 'Core Team' }], { session });
const getExpenses = async (user, query) => {
  const ctx = await context(user);
  const filter = {};
  if (seesFinance(user)) {
    const targetUser = query.userId || query.createdBy;
    if (targetUser && targetUser !== 'all') { const id = safeId(targetUser); if (!id) throw new AppError('INVALID_INPUT', 400); filter.createdBy = id; }
  }
  if (query.dateFrom || query.dateTo) {
    filter.date = {};
    if (query.dateFrom) filter.date.$gte = new Date(query.dateFrom);
    if (query.dateTo) filter.date.$lte = new Date(query.dateTo + 'T23:59:59.999Z');
    if (Object.values(filter.date).some(d => Number.isNaN(d.getTime()))) throw new AppError('INVALID_INPUT', 400);
  }
  for (const field of ['category', 'status', 'department']) if (query[field]) {
    if (typeof query[field] !== 'string') throw new AppError('INVALID_INPUT', 400);
    filter[field] = query[field];
  }
  if (query.search) {
    if (typeof query.search !== 'string' || query.search.length > 200) throw new AppError('INVALID_INPUT', 400);
    const search = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['description', 'notes', 'category'].map(field => ({ [field]: { $regex: search, $options: 'i' } }));
  }
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
  const where = scoped(ctx.scope, filter);
  const [expenses, total] = await Promise.all([
    ctx.model.find(where).sort({ date: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ctx.model.countDocuments(where),
  ]);
  return { expenses: await enrich(expenses), total, page, pages: Math.ceil(total / limit) };
};
const getById = async (user, id) => {
  const scope = scopeFor(user); const objectId = safeId(id); if (!objectId) return null;
  const ctx = await context(user);
  const expense = await ctx.model.findOne(scoped(scope, { _id: objectId })).lean();
  return expense ? (await enrich([expense], true))[0] : null;
};
const create = async (user, data) => {
  const ctx = await context(user); const safe = sanitize(data);
  if (seesFinance(user) && data.status) safe.status = data.status;
  return transaction(ctx.connection, async session => {
    await ensureTaxonomy(ctx, safe, user, session);
    const expense = new ctx.model({ ...safe, createdBy: user._id });
    await expense.save({ session });
    await writeAudit(ctx, session, user, expense, 'EXPENSE_CREATED', safe);
    return (await enrich([expense.toObject()]))[0];
  });
};
const update = async (user, id, data) => {
  const scope = scopeFor(user); const objectId = safeId(id); if (!objectId) return { status: 'missing' };
  const ctx = await context(user); const safe = sanitize(data);
  if (seesFinance(user) && data.status) safe.status = data.status;
  const result = await transaction(ctx.connection, async session => {
    const expense = await ctx.model.findOne(scoped(scope, { _id: objectId })).session(session);
    if (!expense) return { status: 'missing' };
    if (expense.isReimbursedViaPayroll || expense.salaryId) return { status: 'linked' };
    await ensureTaxonomy(ctx, safe, user, session);
    Object.assign(expense, safe);
    await expense.save({ session });
    await writeAudit(ctx, session, user, expense, 'EXPENSE_UPDATED', safe);
    return { status: 'updated', expense: (await enrich([expense.toObject()]))[0] };
  });
  return result;
};
const remove = async (user, id) => {
  const scope = scopeFor(user); const objectId = safeId(id); if (!objectId) return { status: 'missing' };
  const ctx = await context(user);
  return transaction(ctx.connection, async session => {
    const expense = await ctx.model.findOne(scoped(scope, { _id: objectId })).session(session);
    if (!expense) return { status: 'missing' };
    if (expense.isReimbursedViaPayroll || expense.salaryId) return { status: 'linked' };
    await expense.deleteOne({ session });
    await writeAudit(ctx, session, user, expense, 'EXPENSE_DELETED', expense);
    return { status: 'deleted' };
  });
};
const summary = async (user, year) => {
  const ctx = await context(user);
  const targetYear = year ? Number(year) : new Date().getFullYear();
  if (!Number.isInteger(targetYear) || targetYear < 1900 || targetYear > 9999) throw new AppError('INVALID_INPUT', 400);
  const match = scoped(ctx.scope, { date: { $gte: new Date(targetYear, 0, 1), $lte: new Date(targetYear, 11, 31, 23, 59, 59, 999) } });
  const amountMMK = { $cond: [{ $eq: ['$currency', 'USD'] }, { $multiply: ['$amount', { $ifNull: ['$exchangeRate', 0] }] }, '$amount'] };
  const [result] = await ctx.model.aggregate([{ $match: match }, { $addFields: { amountMMK } }, { $facet: {
    monthlyData: [{ $group: { _id: { month: { $month: '$date' } }, total: { $sum: '$amountMMK' }, count: { $sum: 1 } } }, { $sort: { '_id.month': 1 } }],
    categoryBreakdown: [{ $group: { _id: '$category', total: { $sum: '$amountMMK' }, count: { $sum: 1 } } }, { $sort: { total: -1 } }],
    total: [{ $group: { _id: null, total: { $sum: '$amountMMK' } } }],
  } }]);
  return { year: targetYear, totalExpensesMMK: result.total[0]?.total || 0, monthlyData: result.monthlyData, categoryBreakdown: result.categoryBreakdown };
};
const metadataModel = async (user, name, schema) => {
  scopeFor(user);
  const connection = await connections.getConnection('none');
  return connection.models[name] || connection.model(name, schema);
};
const getCategories = async user => (await metadataModel(user, 'ExpenseCategory', ExpenseCategory.schema)).find().sort({ name: 1 });
const getDepartments = async user => (await metadataModel(user, 'ExpenseDepartment', ExpenseDepartment.schema)).find().sort({ name: 1 });
const createCategory = async (user, name) => {
  if (typeof name !== 'string' || !name.trim()) throw new AppError('INVALID_INPUT', 400);
  const model = await metadataModel(user, 'ExpenseCategory', ExpenseCategory.schema);
  if (await model.exists({ name })) return null;
  return model.create({ name, createdBy: user._id });
};
const deleteCategory = async (user, id) => {
  scopeFor(user);
  if (!user.roles.includes('ceo_bd')) throw new AppError('NOT_AUTHORIZED', 403);
  const objectId = safeId(id); if (!objectId) return null;
  const model = await metadataModel(user, 'ExpenseCategory', ExpenseCategory.schema);
  return model.findByIdAndDelete(objectId);
};
module.exports = { getExpenses, getById, create, update, remove, summary, scopeFor,
  getCategories, getDepartments, createCategory, deleteCategory };
