const connections = require('../db/connections');
const { createInvoice, updateInvoice } = require('../repositories/invoiceWrites');

afterEach(() => jest.restoreAllMocks());

test.each(['developer', 'sales'])('%s cannot create or update invoices before connecting', async role => {
  const connection = jest.spyOn(connections, 'getConnection');
  const user = { _id: 'fictional', roles: [role] };
  await expect(createInvoice(user, {})).rejects.toMatchObject({ statusCode: 403 });
  await expect(updateInvoice(user, '000000000000000000000001', {})).rejects.toMatchObject({ statusCode: 403 });
  expect(connection).not.toHaveBeenCalled();
});

test('unknown mutation is rejected before database access', async () => {
  const connection = jest.spyOn(connections, 'getConnection');
  const { mutateInvoice } = require('../repositories/invoiceWrites');
  await expect(mutateInvoice({ _id: 'fictional', roles: ['ceo_bd'] }, '000000000000000000000001', '__proto__')).rejects.toThrow('Unknown invoice operation');
  expect(connection).not.toHaveBeenCalled();
});

test.each([
  ['edit', { amount: 200 }, 'UPDATE'],
  ['status', { status: 'Sent' }, 'STATUS_CHANGE'],
  ['payment', { amount: 100 }, 'PAYMENT_RECEIVED'],
  ['payout', { amount: 50 }, 'PAYOUT_COMPLETED'],
  ['lock', {}, 'LOCKED'],
  ['unlock', {}, 'UNLOCKED'],
  ['delete', {}, 'DELETE'],
])('%s uses the selling connection and records %s action', async (operation, data, expectedAction) => {
  const session = { withTransaction: async (callback) => callback(), endSession: jest.fn() };
  const invoice = { _id: 'fictional-id', isLocked: operation === 'unlock', save: jest.fn(), deleteOne: jest.fn() };
  const model = { findOne: jest.fn().mockReturnValue({ session: async () => invoice }) };
  const audit = { create: jest.fn() };
  const connection = jest.spyOn(connections, 'getConnection').mockResolvedValue({
    models: { Invoice: model, AuditLog: audit }, startSession: async () => session,
  });
  const { mutateInvoice } = require('../repositories/invoiceWrites');
  const result = await mutateInvoice({ _id: 'fictional', username: 'test', roles: ['ceo_bd'] }, '000000000000000000000001', operation, data);
  expect(result.status).toBe('updated');
  expect(connection).toHaveBeenCalledWith('selling');
  expect(audit.create).toHaveBeenCalledWith([expect.objectContaining({ action: expectedAction })], { session });
  expect(operation === 'delete' ? invoice.deleteOne : invoice.save).toHaveBeenCalledWith({ session });
  expect(session.endSession).toHaveBeenCalled();
});

test('locked invoices cannot be edited or deleted', async () => {
  const session = { withTransaction: async callback => callback(), endSession: jest.fn() };
  const invoice = { isLocked: true, save: jest.fn(), deleteOne: jest.fn() };
  const audit = { create: jest.fn() };
  jest.spyOn(connections, 'getConnection').mockResolvedValue({
    models: { Invoice: { findOne: () => ({ session: async () => invoice }) }, AuditLog: audit },
    startSession: async () => session,
  });
  const { mutateInvoice } = require('../repositories/invoiceWrites');
  for (const operation of ['edit', 'delete']) {
    expect((await mutateInvoice({ _id: 'fictional', roles: ['ceo_bd'] }, '000000000000000000000001', operation)).status).toBe('locked');
  }
  expect(invoice.save).not.toHaveBeenCalled();
  expect(invoice.deleteOne).not.toHaveBeenCalled();
  expect(audit.create).not.toHaveBeenCalled();
});
