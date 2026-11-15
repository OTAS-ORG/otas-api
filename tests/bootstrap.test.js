const User = require('../models/User');
const { seedDefaultAdmin } = require('../seeders/defaultDataSeeder');
const systemActor = require('../utils/systemActor');
const { runUserCommand } = require('../commands/users');

const previous = {};
beforeEach(() => {
  for (const key of ['DEFAULT_ADMIN_USERNAME', 'DEFAULT_ADMIN_PASSWORD']) {
    previous[key] = process.env[key];
    delete process.env[key];
  }
  jest.spyOn(User, 'countDocuments').mockResolvedValue(0);
  jest.spyOn(User, 'create').mockResolvedValue({});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  for (const key of Object.keys(previous)) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
  jest.restoreAllMocks();
});

test('empty database requires explicit personal credentials', async () => {
  await expect(seedDefaultAdmin()).rejects.toThrow('personal');
  expect(User.create).not.toHaveBeenCalled();
});
test.each(['admin', 'system'])('reserved username %s is refused', async (username) => {
  process.env.DEFAULT_ADMIN_USERNAME = username;
  process.env.DEFAULT_ADMIN_PASSWORD = 'fictional-password';
  await expect(seedDefaultAdmin()).rejects.toThrow('personal');
  await expect(runUserCommand({ actor: { _id: 'x', active: true, roles: ['ceo_bd'] }, operation: 'createUser', username, roles: ['developer'] }))
    .rejects.toMatchObject({ code: 'INVALID_INPUT' });
});
test('personal CEO account is forced to change password', async () => {
  process.env.DEFAULT_ADMIN_USERNAME = 'fictional-ceo';
  process.env.DEFAULT_ADMIN_PASSWORD = 'fictional-password';
  await seedDefaultAdmin();
  expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ username: 'fictional-ceo', roles: ['ceo_bd'], mustChangePassword: true }));
  expect(JSON.stringify(console.log.mock.calls)).not.toContain('fictional-password');
});
test('does not create or change accounts in a non-empty database', async () => {
  User.countDocuments.mockResolvedValue(1);
  await seedDefaultAdmin();
  expect(User.create).not.toHaveBeenCalled();
});
test('system audit actor has no user identity or credentials', () => {
  expect(systemActor).toEqual({ actorKind: 'system', actor: null });
  expect(Object.isFrozen(systemActor)).toBe(true);
});
