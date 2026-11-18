const mongoose = require('mongoose');
const connections = require('../db/connections');
const { listOwnPayslips } = require('../repositories/ownPayslipRepository');

afterEach(() => jest.restoreAllMocks());

test('own payslip read fixes authenticated owner, paid status and a safe projection', async () => {
  const employeeId = new mongoose.Types.ObjectId();
  const cursor = { sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(), toArray: jest.fn().mockResolvedValue([]) };
  const find = jest.fn(() => cursor);
  const getConnection = jest.spyOn(connections, 'getConnection').mockResolvedValue({ db: { collection: name => {
    expect(name).toBe('salaries'); return { find };
  } } });
  await listOwnPayslips({ _id: employeeId, roles: ['developer'] }, 2);
  expect(getConnection).toHaveBeenCalledWith('finance');
  expect(find.mock.calls[0][0]).toEqual({ userId: employeeId, status: 'Paid' });
  expect(find.mock.calls[0][1].projection).toMatchObject({ netPay: 1, month: 1, year: 1 });
  expect(find.mock.calls[0][1].projection).not.toHaveProperty('notes');
  expect(find.mock.calls[0][1].projection).not.toHaveProperty('createdBy');
  expect(cursor.skip).toHaveBeenCalledWith(20);
});

test('invalid identity, roles and page fail before database access', async () => {
  const getConnection = jest.spyOn(connections, 'getConnection');
  await expect(listOwnPayslips({ _id: 'bad', roles: ['developer'] })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
  await expect(listOwnPayslips({ _id: new mongoose.Types.ObjectId(), roles: [] })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
  await expect(listOwnPayslips({ _id: new mongoose.Types.ObjectId(), roles: ['developer'] }, -1)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  expect(getConnection).not.toHaveBeenCalled();
});

test('payslip pagination indicates whether further rows exist', async () => {
  const employeeId = new mongoose.Types.ObjectId();
  const cursor = { sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(), toArray: jest.fn().mockResolvedValue(Array.from({ length: 21 }, (_, i) => ({ _id: i }))) };
  jest.spyOn(connections, 'getConnection').mockResolvedValue({ db: { collection: () => ({ find: () => cursor }) } });
  const result = await listOwnPayslips({ _id: employeeId, roles: ['sales'] });
  expect(result).toMatchObject({ page: 1, hasMore: true });
  expect(result.payslips).toHaveLength(20);
});
