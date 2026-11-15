const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { planMigration, validateMapping, parseArgs, migrate } = require('../scripts/migrate-user-roles');

const mapping = [{ username: 'example', roles: ['developer'] }];
const legacyUser = { _id: 'fictional-id', username: 'example', role: 'User', password: 'preserve-hash' };

describe('role migration planning', () => {
  test('prepares only account fields and preserves the source', () => {
    const original = { ...legacyUser };
    const [item] = planMigration(mapping, [legacyUser]);
    expect(item.set).toEqual({ roles: ['developer'], active: true, tokenVersion: 1, mustChangePassword: false });
    expect(legacyUser).toEqual(original);
    expect(item.set).not.toHaveProperty('password');
    expect(item.set).not.toHaveProperty('role');
  });

  test('is idempotent and treats role order as irrelevant', () => {
    const multi = [{ username: 'example', roles: ['developer', 'dqa'] }];
    const [first] = planMigration(multi, [legacyUser]);
    const migrated = { ...legacyUser, ...first.set, roles: ['dqa', 'developer'] };
    expect(planMigration(multi, [migrated])[0]).toMatchObject({ changed: false, set: {} });
  });

  test('preserves explicit disabled and forced-change flags and advances token once', () => {
    const [item] = planMigration(mapping, [{ ...legacyUser, active: false, mustChangePassword: true, tokenVersion: 5 }]);
    expect(item.set).toEqual({ roles: ['developer'], tokenVersion: 6 });
  });

  test('initializes missing fields even when roles already match', () => {
    expect(planMigration(mapping, [{ ...legacyUser, roles: ['developer'] }])[0].set)
      .toEqual({ active: true, mustChangePassword: false, tokenVersion: 0 });
  });

  test('fails preflight if any mapped username is missing', () => {
    expect(() => planMigration([...mapping, { username: 'missing', roles: ['dqa'] }], [legacyUser])).toThrow('not found');
  });

  test.each([
    [], [{ username: 'example', roles: [] }], [{ username: 'example', roles: ['Admin'] }],
    [{ username: 'example', roles: ['developer', 'developer'] }], [...mapping, ...mapping],
    [{ username: ' example', roles: ['developer'] }],
    [{ username: 'example', roles: ['developer'], active: true }],
  ].map((value) => [value]))('rejects invalid mapping %#', (value) => {
    expect(() => validateMapping(value)).toThrow();
  });

  test.each([{ tokenVersion: -1 }, { tokenVersion: null }, { tokenVersion: 0.2 },
    { active: null }, { mustChangePassword: 'false' }, { tokenVersion: Number.MAX_SAFE_INTEGER }])(
    'refuses malformed stored security fields %#', (fields) => {
      expect(() => planMigration(mapping, [{ ...legacyUser, ...fields }])).toThrow();
    }
  );
});

describe('migration write boundary', () => {
  const collectionWith = (users) => ({
    find: jest.fn(() => ({ toArray: async () => users })),
    updateOne: jest.fn(async () => ({ matchedCount: 1 })),
  });

  test('dry-run performs no write and does not query password/profile fields', async () => {
    const collection = collectionWith([legacyUser]);
    await migrate({ mapping, collection });
    expect(collection.updateOne).not.toHaveBeenCalled();
    expect(collection.find.mock.calls[0][1].projection).not.toHaveProperty('password');
  });

  test('validates the whole batch before any write', async () => {
    const collection = collectionWith([legacyUser]);
    await expect(migrate({ mapping: [...mapping, { username: 'missing', roles: ['dqa'] }],
      collection, apply: true, session: { inTransaction: () => true } })).rejects.toThrow('not found');
    expect(collection.updateOne).not.toHaveBeenCalled();
  });

  test('refuses apply without an active transaction', async () => {
    const collection = collectionWith([legacyUser]);
    await expect(migrate({ mapping, collection, apply: true })).rejects.toThrow('active transaction');
    expect(collection.updateOne).not.toHaveBeenCalled();
  });

  test('updates only mapped records with the transaction and skips a repeated run', async () => {
    const collection = collectionWith([legacyUser]);
    const session = { inTransaction: () => true };
    const [item] = await migrate({ mapping, collection, apply: true, session });
    expect(collection.updateOne).toHaveBeenCalledWith({ _id: legacyUser._id },
      { $set: { ...item.set, updatedAt: expect.any(Date) } }, { session });
    collection.find.mockImplementation(() => ({ toArray: async () => [{ ...legacyUser, ...item.set }] }));
    collection.updateOne.mockClear();
    await migrate({ mapping, collection, apply: true, session });
    expect(collection.updateOne).not.toHaveBeenCalled();
  });
});

describe('migration CLI', () => {
  test('defaults to dry-run and requires explicit E-1 approval to apply', () => {
    expect(parseArgs(['--config', 'external.json']).apply).toBe(false);
    expect(() => parseArgs(['--config', 'external.json', '--apply'])).toThrow('E-1');
    expect(parseArgs(['--config', 'external.json', '--apply', '--staff-roles-approved']).apply).toBe(true);
  });

  test.each([
    [], ['--config'], ['--config', 'file', '--unknown'],
    ['--config', 'file', '--apply', '--dry-run', '--staff-roles-approved'],
    ['--config', 'file', '--apply', '--staff-roles-approved', '--users-fixture', 'fixture'],
  ].map((value) => [value]))('rejects unsafe or ambiguous options %#', (args) => {
    expect(() => parseArgs(args)).toThrow();
  });

  test('real CLI previews fictional users without any database environment', () => {
    const env = { ...process.env };
    delete env.MONGODB_URI;
    const stdout = execFileSync(process.execPath, [
      path.join(__dirname, '../scripts/migrate-user-roles.js'),
      '--config', path.join(__dirname, 'fixtures/role-mapping.json'),
      '--users-fixture', path.join(__dirname, 'fixtures/legacy-users.json'), '--dry-run',
    ], { env, encoding: 'utf8' });
    expect(JSON.parse(stdout)).toMatchObject({ mode: 'dry-run', source: 'fictional-fixture', changed: 2, unchanged: 0 });
  });
});
