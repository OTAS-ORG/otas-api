const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { setVaultPin } = require('../controllers/authController');

const app = express();
app.use(express.json());
app.post('/pin', (req, res, next) => { req.user = { _id: 'fictional' }; next(); }, setVaultPin);
let user;
beforeEach(() => {
  user = { vaultPin: null, vaultPinAttempts: 4, vaultPinLockedUntil: new Date(),
    matchPassword: jest.fn(async (value) => value === 'fictional-account-password'),
    save: jest.fn(async () => {}) };
  jest.spyOn(User, 'findById').mockResolvedValue(user);
});
afterEach(() => jest.restoreAllMocks());

test('initial setup requires a nonempty account password', async () => {
  const response = await request(app).post('/pin').send({ pin: '1234', currentPassword: '' });
  expect(response.status).toBe(400);
  expect(user.save).not.toHaveBeenCalled();
});
test.each([null, 'previous-hash'])('setup/change rejects wrong account password (existing PIN %s)', async (existing) => {
  user.vaultPin = existing;
  const response = await request(app).post('/pin').send({ pin: '1234', currentPassword: 'wrong' });
  expect(response.status).toBe(403);
  expect(user.save).not.toHaveBeenCalled();
});
test('correct account password hashes PIN and resets old lock', async () => {
  const response = await request(app).post('/pin').send({ pin: '1234', currentPassword: 'fictional-account-password' });
  expect(response.status).toBe(200);
  expect(await bcrypt.compare('1234', user.vaultPin)).toBe(true);
  expect(user.vaultPinAttempts).toBe(0);
  expect(user.vaultPinLockedUntil).toBeNull();
  expect(JSON.stringify(response.body)).not.toContain('1234');
});
