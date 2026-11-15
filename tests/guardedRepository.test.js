const { AbilityBuilder, createMongoAbility } = require('@casl/ability');
const connections = require('../db/connections');
const { findMany, classAllowed } = require('../repositories/guardedRepository');

afterEach(() => jest.restoreAllMocks());

test('developer cannot access selling records and no connection is attempted', async () => {
  const spy = jest.spyOn(connections, 'getConnection');
  await expect(findMany({ user: { roles: ['developer'] }, collection: 'invoices' }))
    .rejects.toMatchObject({ code: 'MONEY_CLASS_DENIED' });
  expect(spy).not.toHaveBeenCalled();
});

test('unknown collections and missing abilities fail before connecting', async () => {
  const spy = jest.spyOn(connections, 'getConnection');
  const user = { roles: ['ceo_bd'] };
  await expect(findMany({ user, collection: 'unknown' })).rejects.toMatchObject({ code: 'MONEY_CLASS_DENIED' });
  await expect(findMany({ user, collection: 'invoices' })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
  expect(spy).not.toHaveBeenCalled();
});

test('allowed reads use the class pool and retain the CASL row filter', async () => {
  const builder = new AbilityBuilder(createMongoAbility);
  builder.can('read', 'Invoice', { owner: 'fictional-user' });
  const find = jest.fn(() => ({ toArray: async () => [] }));
  const getConnection = jest.spyOn(connections, 'getConnection').mockResolvedValue({ db: { collection: () => ({ find }) } });
  await findMany({ user: { roles: ['sales'] }, ability: builder.build(), collection: 'invoices', filter: { status: 'Paid' } });
  expect(getConnection).toHaveBeenCalledWith('selling');
  expect(find.mock.calls[0][0]).toEqual({ $and: [{ $or: [{ owner: 'fictional-user' }] }, { status: 'Paid' }] });
});

test('money classes do not accept unknown or absent roles', () => {
  expect(classAllowed({ roles: ['developer'] }, 'finance')).toBe(false);
  expect(classAllowed({ roles: ['finance_admin'] }, 'cost')).toBe(false);
  expect(classAllowed({ roles: ['ceo_bd'] }, 'unknown')).toBe(false);
  expect(classAllowed(null, 'none')).toBe(false);
});

test('invoice client lookup enforces its fixed projection using the base pool', async () => {
  const builder = new AbilityBuilder(createMongoAbility);
  builder.can('read', 'InvoiceClient');
  const find = jest.fn(() => ({ toArray: async () => [] }));
  const connection = jest.spyOn(connections, 'getConnection').mockResolvedValue({ db: { collection: () => ({ find }) } });
  await findMany({ user: { roles: ['ceo_bd'] }, ability: builder.build(), collection: 'clients' });
  expect(connection).toHaveBeenCalledWith('none');
  expect(find.mock.calls[0][1]).toEqual({ projection: { _id: 1, companyName: 1, contactPerson: 1 } });
});
