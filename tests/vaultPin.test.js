const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const PasswordVault = require('../models/PasswordVault');
const { decryptPassword } = require('../controllers/passwordController');

jest.mock('../utils/encryption', () => ({ decrypt: jest.fn(() => 'fictional-password') }));

const app = express();
app.use(express.json());
app.post('/decrypt/:id', (req, res, next) => { req.user = { _id: 'fictional-user' }; next(); }, decryptPassword);
let pinHash;
beforeAll(async () => { pinHash = await bcrypt.hash('1234', 10); });
beforeEach(() => {
  jest.spyOn(User, 'findOneAndUpdate').mockReturnValue({ select: jest.fn(async () => ({ vaultPin: pinHash, vaultPinAttempts: 1 })) });
  jest.spyOn(User, 'updateOne').mockResolvedValue({ matchedCount: 1 });
  jest.spyOn(PasswordVault, 'findById').mockResolvedValue({ encryptedPassword: 'encrypted', iv: 'iv', authTag: 'tag' });
});
afterEach(() => jest.restoreAllMocks());

test.each([{}, { pin: '' }, { pin: 1234 }, { pin: 'က'.repeat(25) }])('missing or invalid PIN fails before vault lookup %#', async (body) => {
  const res = await request(app).post('/decrypt/example').send(body);
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('VAULT_PIN_REQUIRED');
  expect(PasswordVault.findById).not.toHaveBeenCalled();
});

test('wrong PIN cannot decrypt and does not look up the vault entry', async () => {
  const res = await request(app).post('/decrypt/example').send({ pin: '9999' });
  expect(res.status).toBe(403);
  expect(res.body.code).toBe('VAULT_PIN_INVALID');
  expect(PasswordVault.findById).not.toHaveBeenCalled();
});

test('missing configured PIN cannot decrypt', async () => {
  User.findOneAndUpdate.mockReturnValue({ select: jest.fn(async () => null) });
  const res = await request(app).post('/decrypt/example').send({ pin: '1234' });
  expect(res.status).toBe(429);
  expect(PasswordVault.findById).not.toHaveBeenCalled();
});

test('correct PIN permits only that request to reveal the entry', async () => {
  const res = await request(app).post('/decrypt/example').send({ pin: '1234' });
  expect(res.status).toBe(200);
  expect(res.body.data.password).toBe('fictional-password');
  const next = await request(app).post('/decrypt/example').send({});
  expect(next.status).toBe(400);
  expect(PasswordVault.findById).toHaveBeenCalledTimes(1);
});
