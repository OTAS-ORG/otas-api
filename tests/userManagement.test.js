const mongoose = require('mongoose');
const User = require('../models/User');
const StepLog = require('../models/StepLog');
const { ROLES } = require('../permissions/roles');
const { runUserCommand } = require('../commands/users');

const id = new mongoose.Types.ObjectId();
const actorId = new mongoose.Types.ObjectId();
const ceo = { _id: actorId, active: true, roles: ['ceo_bd'] };
let session, user;

beforeEach(() => {
  session = { withTransaction: jest.fn(async (work) => work()), endSession: jest.fn(async () => {}) };
  jest.spyOn(User.db, 'startSession').mockResolvedValue(session);
  user = { _id: id, username: 'fictional', fullName: 'Test', roles: ['developer'], active: true,
    tokenVersion: 2, mustChangePassword: false, password: 'private-hash', save: jest.fn(async () => {}) };
  jest.spyOn(User, 'findById').mockReturnValue({ session: jest.fn(async () => user) });
  jest.spyOn(StepLog, 'create').mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

test.each(ROLES.filter((role) => role !== 'ceo_bd'))('%s cannot operate user management', async (role) => {
  await expect(runUserCommand({ actor: { _id: actorId, active: true, roles: [role] },
    operation: 'disableUser', userId: id.toString() })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
  expect(User.db.startSession).not.toHaveBeenCalled();
});

test('CEO disables user and records the action inside the same transaction', async () => {
  const result = await runUserCommand({ actor: ceo, operation: 'disableUser', userId: id.toString() });
  expect(user.active).toBe(false);
  expect(user.tokenVersion).toBe(3);
  expect(user.save).toHaveBeenCalledWith({ session });
  expect(StepLog.create).toHaveBeenCalledWith([expect.objectContaining({ stepKey: 'disableUser', actor: actorId, entityId: id })], { session });
  expect(result.user).not.toHaveProperty('password');
  expect(session.endSession).toHaveBeenCalled();
});

test('role updates revoke sessions and reject invalid roles', async () => {
  await runUserCommand({ actor: ceo, operation: 'setUserRoles', userId: id.toString(), roles: ['dqa'] });
  expect(user.roles).toEqual(['dqa']);
  expect(user.tokenVersion).toBe(3);
  await expect(runUserCommand({ actor: ceo, operation: 'setUserRoles', userId: id.toString(), roles: ['Admin'] }))
    .rejects.toMatchObject({ code: 'ROLE_INVALID' });
});

test('temporary reset does not store the secret in audit details', async () => {
  const result = await runUserCommand({ actor: ceo, operation: 'resetPasswordTemp', userId: id.toString() });
  expect(result.temporaryPassword.length).toBeGreaterThan(10);
  expect(user.password).toBe(result.temporaryPassword);
  expect(user.mustChangePassword).toBe(true);
  expect(user.tokenVersion).toBe(3);
  expect(JSON.stringify(StepLog.create.mock.calls)).not.toContain(result.temporaryPassword);
});

test('audit failure aborts the transaction and does not return a temporary password', async () => {
  StepLog.create.mockRejectedValue(new Error('fictional database failure'));
  await expect(runUserCommand({ actor: ceo, operation: 'resetPasswordTemp', userId: id.toString() })).rejects.toThrow();
  expect(session.endSession).toHaveBeenCalled();
});

test('prevents current CEO from disabling self or removing own CEO role', async () => {
  await expect(runUserCommand({ actor: ceo, operation: 'disableUser', userId: actorId.toString() })).rejects.toMatchObject({ code: 'USER_CONFLICT' });
  await expect(runUserCommand({ actor: ceo, operation: 'setUserRoles', userId: actorId.toString(), roles: ['sales'] })).rejects.toMatchObject({ code: 'USER_CONFLICT' });
  expect(User.db.startSession).not.toHaveBeenCalled();
});
