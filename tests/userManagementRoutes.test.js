const express = require('express');
const request = require('supertest');
const { ROLES } = require('../permissions/roles');
const { assertMoneyFree } = require('./helpers/moneySweep');

jest.mock('../middleware/authMiddleware', () => ({
  protect: (req, res, next) => { req.user = { _id: 'fictional', active: true, roles: [req.get('X-Test-Role')] }; next(); },
  protectPasswordChange: (req, res, next) => next(),
}));
jest.mock('../models/User', () => ({
  find: () => ({ select: () => ({ sort: async () => [{ _id: 'fictional', username: 'test', fullName: 'Test', roles: ['developer'], active: true, mustChangePassword: false, baseSalary: '123 MMK' }] }) }),
}));
jest.mock('../commands/users', () => ({
  runUserCommand: jest.fn(async () => ({ user: { _id: 'fictional', username: 'test', roles: ['developer'], active: true } })),
  safeUser: (u) => ({ _id: u._id, username: u.username, fullName: u.fullName, roles: u.roles, active: u.active, mustChangePassword: u.mustChangePassword }),
}));

const app = express();
app.use(express.json());
app.use('/auth', require('../routes/authRoutes'));
const id = '507f1f77bcf86cd799439011';

test.each(ROLES)('%s has only the appropriate user management access', async (role) => {
  const directory = await request(app).get('/auth/users').set('X-Test-Role', role);
  expect(directory.status).toBe(200);
  expect(JSON.stringify(directory.body)).not.toContain('baseSalary');
  const results = await Promise.all([
    request(app).post('/auth/users').set('X-Test-Role', role).send({ username: 'fictional', roles: ['developer'] }),
    request(app).put(`/auth/users/${id}/roles`).set('X-Test-Role', role).send({ roles: ['developer'] }),
    request(app).post(`/auth/users/${id}/disable`).set('X-Test-Role', role),
    request(app).post(`/auth/users/${id}/enable`).set('X-Test-Role', role),
    request(app).post(`/auth/users/${id}/reset-password`).set('X-Test-Role', role),
  ]);
  for (const response of results) {
    expect(response.status).toBe(role === 'ceo_bd' ? (response.req.method === 'POST' && response.req.path === '/auth/users' ? 201 : 200) : 403);
    if (role !== 'ceo_bd') expect(response.body.code).toBe('NOT_AUTHORIZED');
  }
  if (['content_creator', 'pd_head', 'developer', 'uiux', 'dqa_head', 'dqa'].includes(role)) {
    assertMoneyFree(directory.body);
    for (const response of results) assertMoneyFree(response.body);
  }
});

test('money sweep detects forbidden currencies', () => {
  expect(() => assertMoneyFree({ description: '100 MMK' })).toThrow();
  expect(() => assertMoneyFree({ description: 'safe' })).not.toThrow();
});
