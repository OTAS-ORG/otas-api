const mongoose = require('mongoose');
const { accessibleBy } = require('@casl/mongoose');
const Invoice = require('../models/Invoice');
const AuditLog = require('../models/AuditLog');
const connections = require('../db/connections');
const { defineAbilityFor } = require('../permissions/ability');
const { authorizeCollection } = require('./guardedRepository');

const context = async (user, action) => {
  const ability = defineAbilityFor(user);
  authorizeCollection({ user, ability, collection: 'invoices', action });
  const connection = await connections.getConnection('selling');
  return { connection, ability,
    model: connection.models.Invoice || connection.model('Invoice', Invoice.schema),
    audit: connection.models.AuditLog || connection.model('AuditLog', AuditLog.schema) };
};
const calculate = (data, previous = {}) => {
  const result = { ...data };
  if (result.amount !== undefined && result.platformFeeRate !== undefined)
    result.platformFee = Math.round(result.amount * (result.platformFeeRate / 100));
  else if (result.amount !== undefined && previous.platformFeeRate)
    result.platformFee = Math.round(result.amount * (previous.platformFeeRate / 100));
  if (result.items) result.items = result.items.map(item => ({
    ...item, amount: item.amount || (item.quantity || 1) * (item.unitPrice || 0),
  }));
  return result;
};
const protectedFields = ['_id', 'id', '__v', 'createdBy', 'createdAt', 'updatedAt', 'invoiceNumber', 'isLocked', 'status', 'paymentStatus', 'payoutStatus', 'paymentDetails', 'payoutDetails'];
const sanitized = data => { const safe = { ...data }; for (const key of protectedFields) delete safe[key]; return safe; };
const transaction = async (connection, run) => {
  const session = await connection.startSession();
  try { let result; await session.withTransaction(async () => { result = await run(session); }); return result; }
  finally { await session.endSession(); }
};
const audit = (ctx, session, invoice, user, action, details) => ctx.audit.create([{ clientId: invoice._id, action, details, user: user.username || 'Core Team' }], { session });
const numberFor = async (ctx, session, type, serviceType) => {
  const counters = ctx.connection.db.collection('counters');
  const key = 'invoice-sequence';
  const counter = await counters.findOne({ _id: key }, { session });
  if (!counter) {
    const numbers = await ctx.model.find({}, { invoiceNumber: 1 }).session(session).lean();
    const max = numbers.reduce((n, row) => {
      const match = /^INV-(?:SVF-|DMF-|MTF-|SRV-)?\d{4}(\d+)$/.exec(row.invoiceNumber || '');
      return match ? Math.max(n, Number(match[1])) : n;
    }, 0);
    if (!Number.isSafeInteger(max)) throw new Error('Invalid invoice sequence');
    await counters.updateOne({ _id: key }, { $setOnInsert: { value: max } }, { upsert: true, session });
  }
  const updated = await counters.findOneAndUpdate({ _id: key }, { $inc: { value: 1 } }, { returnDocument: 'after', session });
  if (!Number.isSafeInteger(updated.value)) throw new Error('Invalid invoice sequence');
  const now = new Date();
  const datePart = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefix = type === 'service_fee' && serviceType ? ({ server: 'SVF', domain: 'DMF', maintenance: 'MTF' }[serviceType] || 'SRV') : '';
  return `INV-${prefix}${prefix ? '-' : ''}${datePart}${String(updated.value).padStart(4, '0')}`;
};
const createInvoice = async (user, data) => {
  const ctx = await context(user, 'create');
  return transaction(ctx.connection, async session => {
    const invoiceNumber = await numberFor(ctx, session, data.type, data.serviceType);
    const invoice = new ctx.model({ ...calculate(sanitized(data)), invoiceNumber, createdBy: user._id });
    await invoice.save({ session });
    await audit(ctx, session, invoice, user, 'CREATE', { invoiceNumber });
    return invoice;
  });
};
const operations = {
  edit(invoice, data) { const changes = calculate(sanitized(data), invoice); Object.assign(invoice, changes); return ['UPDATE', { changes }]; },
  status(invoice, data) { const changes = {}; for (const key of ['status', 'paymentStatus', 'payoutStatus']) if (data[key]) { invoice[key] = data[key]; changes[key] = data[key]; } return ['STATUS_CHANGE', changes]; },
  payment(invoice, data) { const { channel, amount, senderName, dateTime, note } = data; invoice.paymentStatus = 'Received'; invoice.status = 'Paid'; invoice.paymentDetails = { channel, amount, senderName, dateTime, note }; return ['PAYMENT_RECEIVED', { channel, amount, senderName }]; },
  payout(invoice, data) { const { channel, amount, receiverName, dateTime, note } = data; invoice.payoutStatus = 'Paid'; invoice.payoutDetails = { channel, amount, receiverName, dateTime, note }; return ['PAYOUT_COMPLETED', { channel, amount, receiverName }]; },
  lock(invoice) { invoice.isLocked = true; invoice.status = 'Paid'; return ['LOCKED', { message: 'Invoice locked' }]; },
  unlock(invoice) { invoice.isLocked = false; return ['UNLOCKED', { message: 'Invoice unlocked' }]; },
  delete() { return ['DELETE', {}]; },
};
const mutateInvoice = async (user, id, operation, data = {}) => {
  if (!Object.hasOwn(operations, operation)) throw new Error('Unknown invoice operation');
  const action = operation === 'delete' ? 'delete' : 'update';
  const ctx = await context(user, action);
  if (!mongoose.isObjectIdOrHexString(id)) return { status: 'missing' };
  const scope = accessibleBy(ctx.ability, action).ofType('Invoice');
  return transaction(ctx.connection, async session => {
    const invoice = await ctx.model.findOne({ $and: [scope, { _id: id }] }).session(session);
    if (!invoice) return { status: 'missing' };
    if (invoice.isLocked && !['unlock'].includes(operation)) return { status: 'locked' };
    const [auditAction, details] = operations[operation](invoice, data);
    if (operation === 'delete') await invoice.deleteOne({ session });
    else await invoice.save({ session });
    await audit(ctx, session, invoice, user, auditAction, details);
    return { status: 'updated', invoice };
  });
};
const updateInvoice = (user, id, data) => mutateInvoice(user, id, 'edit', data);
module.exports = { createInvoice, updateInvoice, mutateInvoice };
