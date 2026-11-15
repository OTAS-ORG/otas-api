const mongoose = require('mongoose');
const guarded = require('../repositories/guardedRepository');
const { listInvoices, getInvoice } = require('../repositories/invoiceReads');

afterEach(() => jest.restoreAllMocks());

test('invoice list passes authorized user, safe query and sorting to the guarded repository', async () => {
  const id = new mongoose.Types.ObjectId();
  const spy = jest.spyOn(guarded, 'findMany').mockResolvedValue([{ _id: id, amount: 100, platformFee: 5, additionalCharges: [{ amount: 2 }] }]);
  const user = { _id: 'fictional', roles: ['finance_admin'] };
  const result = await listInvoices(user, { status: 'Paid' });
  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ user, collection: 'invoices', filter: { status: 'Paid' }, sort: { createdAt: -1 } }));
  expect(spy.mock.calls[0][0].ability.can('read', 'Invoice')).toBe(true);
  expect(result[0]).toMatchObject({ id: id.toString(), grandTotal: 107 });
});

test('developer is denied by the guarded repository before database access', async () => {
  const connections = require('../db/connections');
  const spy = jest.spyOn(connections, 'getConnection');
  await expect(listInvoices({ _id: 'fictional', roles: ['developer'] })).rejects.toMatchObject({ code: 'MONEY_CLASS_DENIED' });
  expect(spy).not.toHaveBeenCalled();
});

test('detail uses guarded invoice and restricted client reads and preserves populated client', async () => {
  const id = new mongoose.Types.ObjectId();
  const clientId = new mongoose.Types.ObjectId();
  const spy = jest.spyOn(guarded, 'findMany')
    .mockResolvedValueOnce([{ _id: id, clientId, amount: 100 }])
    .mockResolvedValueOnce([{ _id: clientId, companyName: 'Fictional', contactPerson: 'Test' }]);
  const result = await getInvoice({ _id: 'fictional', roles: ['ceo_bd'] }, id.toString());
  expect(spy.mock.calls[0][0]).toMatchObject({ collection: 'invoices', filter: { _id: id } });
  expect(spy.mock.calls[1][0]).toMatchObject({ collection: 'clients', filter: { _id: clientId } });
  expect(result).toMatchObject({ grandTotal: 100, clientId: { id: clientId.toString(), companyName: 'Fictional' } });
});

test('detail returns null for invalid or absent invoice and missing client', async () => {
  const id = new mongoose.Types.ObjectId();
  const spy = jest.spyOn(guarded, 'findMany').mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ _id: id, clientId: new mongoose.Types.ObjectId() }]).mockResolvedValueOnce([]);
  const user = { _id: 'fictional', roles: ['ceo_bd'] };
  expect(await getInvoice(user, 'bad-id')).toBeNull();
  expect(await getInvoice(user, id.toString())).toBeNull();
  expect((await getInvoice(user, id.toString())).clientId).toBeNull();
  expect(spy).toHaveBeenCalledTimes(3);
});
