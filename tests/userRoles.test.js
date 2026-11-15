const User = require('../models/User');
const { ROLES } = require('../permissions/roles');

describe('F1-01 user schema', () => {
  const createUser = (fields = {}) => new User({ username: 'fictional', password: 'test-only', ...fields });

  test('adds safe defaults without assigning a privileged role', async () => {
    const user = createUser();
    await user.validate();
    expect(user.roles).toEqual([]);
    expect(user.active).toBe(true);
    expect(user.tokenVersion).toBe(0);
    expect(user.mustChangePassword).toBe(false);
    expect(user.role).toBe('User');
  });

  test.each(ROLES)('accepts approved role %s', async (role) => {
    await expect(createUser({ roles: [role] }).validate()).resolves.toBeUndefined();
  });

  test.each([['owner'], ['developer', 'developer'], null].map((value) => [value]))('rejects invalid roles %j', async (roles) => {
    await expect(createUser({ roles }).validate()).rejects.toThrow();
  });

  test.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, null])('rejects invalid tokenVersion %s', async (tokenVersion) => {
    await expect(createUser({ tokenVersion }).validate()).rejects.toThrow();
  });

  test('keeps legacy Admin and explicit account flags during transition', async () => {
    const user = createUser({ role: 'Admin', roles: ['ceo_bd', 'sales'], active: false, mustChangePassword: true, tokenVersion: 3 });
    await user.validate();
    expect(user.role).toBe('Admin');
    expect(user.active).toBe(false);
    expect(user.mustChangePassword).toBe(true);
    expect(user.tokenVersion).toBe(3);
  });
});
