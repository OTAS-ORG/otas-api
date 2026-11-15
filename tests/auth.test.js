const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const authRoutes = require('../routes/authRoutes');
const { protect } = require('../middleware/authMiddleware');
const { ROLES } = require('../permissions/roles');

const SECRET = 'fictional-auth-test-secret';
const ID = '507f1f77bcf86cd799439011';
const CURRENT = 'Fictional-current-password';
const NEXT = 'Fictional-next-password';
const SESSION_KEYS = ['_id', 'username', 'fullName', 'roles', 'mustChangePassword', 'token'].sort();
let stored, initialHash, race;
let previousSecret;

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.get('/api/private', protect, (req, res) => res.json({ success: true }));

// Snapshot query double: actual router/middleware, bcrypt, JWT and User hydration run.
// Only persistence is substituted; these are not MongoDB integration tests.
const query = (read) => {
  const chain = {
    select: jest.fn(() => chain),
    populate: jest.fn(() => chain),
    then: (resolve, reject) => Promise.resolve().then(read).then(resolve, reject),
  };
  return chain;
};
const snapshot = () => stored ? User.hydrate(JSON.parse(JSON.stringify(stored))) : null;
const matches = (record, filter) => Object.entries(filter).every(([key, value]) => {
  if (key === '$and') return value.every((item) => matches(record, item));
  if (key === '$or') return value.some((item) => matches(record, item));
  if (value && typeof value === 'object' && '$exists' in value) return (record[key] !== undefined) === value.$exists;
  return String(record[key]) === String(value);
});
const token = (claims = {}, options = {}) => jwt.sign({ id: ID, tokenVersion: 0, ...claims }, SECRET,
  { algorithm: 'HS256', expiresIn: '7d', ...options });
const auth = (value = token()) => `Bearer ${value}`;
const login = (body = { username: 'fictional', password: CURRENT }) => request(app).post('/api/auth/login').send(body);
const change = (value = token(), body = { currentPassword: CURRENT, newPassword: NEXT }) =>
  request(app).post('/api/auth/change-password').set('Authorization', auth(value)).send(body);

beforeAll(async () => {
  previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  initialHash = await bcrypt.hash(CURRENT, 10);
});
afterAll(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});
beforeEach(() => {
  race = null;
  stored = { _id: ID, username: 'fictional', fullName: 'Fictional Developer', roles: ['developer'],
    role: 'User', active: true, tokenVersion: 0, mustChangePassword: false,
    password: initialHash, vaultPin: 'sensitive-test-pin', baseSalary: 12345,
    fullDayDeduction: 500, halfDayDeduction: 250, departments: [] };
  jest.spyOn(User, 'findOne').mockImplementation((filter) => query(() => stored && stored.username === filter.username ? snapshot() : null));
  jest.spyOn(User, 'findById').mockImplementation(() => query(snapshot));
  jest.spyOn(User, 'findOneAndUpdate').mockImplementation((filter, update) => query(() => {
    if (race) race();
    if (!stored || !matches(stored, filter)) return null;
    Object.assign(stored, update.$set);
    return snapshot();
  }));
});
afterEach(() => jest.restoreAllMocks());

describe('F1-02 login and session privacy', () => {
  test('issues a seven-day versioned token and exactly six safe fields', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(SESSION_KEYS);
    const decoded = jwt.verify(res.body.data.token, SECRET);
    expect(decoded).toMatchObject({ id: ID, tokenVersion: 0 });
    expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
    expect(JSON.stringify(res.body)).not.toMatch(/baseSalary|deduction|vaultPin|encryptedPassword|12345|sensitive-test-pin/i);
  });

  test.each(ROLES)('keeps %s out of money/profile data in login and me', async (role) => {
    stored.roles = [role];
    const res = await login();
    expect(res.body.data.roles).toEqual([role]);
    const me = await request(app).get('/api/auth/me').set('Authorization', auth(res.body.data.token));
    expect(me.status).toBe(200);
    expect(Object.keys(me.body.data).sort()).toEqual(SESSION_KEYS);
    expect(me.body.data.token).toBe(res.body.data.token);
    expect(JSON.stringify(me.body)).not.toMatch(/baseSalary|deduction|vaultPin|passwordHash|12345|sensitive-test-pin/i);
  });

  test.each([{ username: { $ne: '' }, password: CURRENT }, { username: 'fictional', password: [] }, {}])(
    'rejects malformed login %# before querying', async (body) => {
      expect((await login(body)).status).toBe(400);
      expect(User.findOne).not.toHaveBeenCalled();
    }
  );
  test('rejects wrong credentials and nonexistent users', async () => {
    expect((await login({ username: 'fictional', password: 'wrong' })).body.code).toBe('INVALID_CREDENTIALS');
    stored = null;
    expect((await login()).status).toBe(401);
  });
  test('disabled accounts cannot log in with the right password', async () => {
    stored.active = false;
    const res = await login();
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('USER_DISABLED');
    expect(res.body).not.toHaveProperty('data');
  });
  test('legacy stored records receive schema defaults but old tokens are rejected', async () => {
    delete stored.active;
    delete stored.tokenVersion;
    const res = await login();
    expect(res.status).toBe(200);
    expect(jwt.verify(res.body.data.token, SECRET).tokenVersion).toBe(0);
    const old = jwt.sign({ id: ID }, SECRET, { expiresIn: '30d' });
    const rejected = await request(app).get('/api/private').set('Authorization', auth(old));
    expect(rejected.status).toBe(401);
    expect(rejected.body.code).toBe('TOKEN_REVOKED');
  });
});

describe('protected requests', () => {
  test.each(['', 'Bearer', 'Bearer junk extra', 'Basic secret', 'BearerNotAToken'])('rejects malformed header %s', async (header) => {
    expect((await request(app).get('/api/private').set('Authorization', header)).status).toBe(401);
    expect(User.findById).not.toHaveBeenCalled();
  });
  test.each([
    () => 'junk', () => token({}, { expiresIn: -1 }), () => token({ id: 'not-an-id' }),
    () => token({ tokenVersion: -1 }), () => token({ tokenVersion: '0' }),
    () => token({}, { algorithm: 'HS384' }), () => jwt.sign({ id: ID, tokenVersion: 0 }, SECRET),
  ])('rejects invalid, expired or unversioned session %#', async (makeToken) => {
    const res = await request(app).get('/api/private').set('Authorization', auth(makeToken()));
    expect(res.status).toBe(401);
  });
  test('reads enabled state on every request', async () => {
    const issued = token();
    expect((await request(app).get('/api/private').set('Authorization', auth(issued))).status).toBe(200);
    stored.active = false;
    const denied = await request(app).get('/api/private').set('Authorization', auth(issued));
    expect(denied.status).toBe(401);
    expect(denied.body.code).toBe('USER_DISABLED');
  });
  test('deleted accounts cannot access a protected endpoint', async () => {
    stored = null;
    expect((await request(app).get('/api/private').set('Authorization', auth())).status).toBe(401);
  });
  test('changed version revokes sessions immediately', async () => {
    stored.tokenVersion = 1;
    const res = await request(app).get('/api/private').set('Authorization', auth());
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_REVOKED');
  });
  test('database failures fail closed with an availability error', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    User.findById.mockImplementation(() => query(() => { throw new Error('fictional DB error'); }));
    const res = await request(app).get('/api/private').set('Authorization', auth());
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AUTH_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('fictional DB error');
  });
});

describe('password change and forced change', () => {
  test('temporary-password login works but all normal protected routes are gated', async () => {
    stored.mustChangePassword = true;
    const signedIn = await login();
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.data.mustChangePassword).toBe(true);
    for (const route of ['/api/auth/me', '/api/auth/users', '/api/private']) {
      const res = await request(app).get(route).set('Authorization', auth(signedIn.body.data.token));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    }
    const spoof = await request(app).post('/api/auth/set-vault-pin?path=/change-password')
      .set('Authorization', auth(signedIn.body.data.token)).send({ pin: '1234' });
    expect(spoof.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await change(signedIn.body.data.token)).status).toBe(200);
  });
  test('hashes a new password, clears the gate and invalidates every old session', async () => {
    stored.mustChangePassword = true;
    const old = token();
    const res = await change(old);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(SESSION_KEYS);
    expect(stored.password).not.toBe(NEXT);
    expect(await bcrypt.compare(NEXT, stored.password)).toBe(true);
    expect(await bcrypt.compare(CURRENT, stored.password)).toBe(false);
    expect(stored.tokenVersion).toBe(1);
    expect(stored.mustChangePassword).toBe(false);
    const revoked = await request(app).get('/api/private').set('Authorization', auth(old));
    expect(revoked.status).toBe(401);
    expect(revoked.body.code).toBe('TOKEN_REVOKED');
    expect((await request(app).get('/api/auth/me').set('Authorization', auth(res.body.data.token))).status).toBe(200);
    expect((await login()).status).toBe(401);
    expect((await login({ username: 'fictional', password: NEXT })).status).toBe(200);
  });
  test.each([
    {}, { currentPassword: CURRENT, newPassword: ' ' },
    { currentPassword: CURRENT, newPassword: 'က'.repeat(25) },
    { currentPassword: CURRENT, newPassword: {} },
    { currentPassword: 'wrong', newPassword: NEXT },
    { currentPassword: CURRENT, newPassword: CURRENT },
  ])('rejects invalid/current/reused passwords without writing %#', async (body) => {
    const res = await change(token(), body);
    expect(res.status).toBe(400);
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(stored.password).toBe(initialHash);
    expect(stored.tokenVersion).toBe(0);
  });
  test('requires authentication even on the forced-change exception', async () => {
    expect((await request(app).post('/api/auth/change-password').send({ currentPassword: CURRENT, newPassword: NEXT })).status).toBe(401);
  });
  test.each([
    () => { stored.active = false; },
    () => { stored.tokenVersion += 1; },
    () => { stored.password = 'concurrent-password-hash'; },
  ])('compare-and-set refuses a concurrent security change %#', async (mutate) => {
    race = mutate;
    const res = await change();
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_REVOKED');
    expect(stored.password).not.toBe(NEXT);
    expect(res.body).not.toHaveProperty('data');
  });
  test('safely initializes legacy missing version on password change', async () => {
    delete stored.tokenVersion;
    delete stored.active;
    const res = await change();
    expect(res.status).toBe(200);
    expect(stored.tokenVersion).toBe(1);
  });
});
