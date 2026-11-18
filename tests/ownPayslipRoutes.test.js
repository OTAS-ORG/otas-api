const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const mockIdentity = new mongoose.Types.ObjectId();
jest.mock('../middleware/authMiddleware', () => ({ protect: (req, res, next) => {
  req.user = { _id: mockIdentity, roles: ['developer'] }; next();
} }));
jest.mock('../repositories/ownPayslipRepository', () => ({ listOwnPayslips: jest.fn().mockResolvedValue({ payslips: [], page: 1, hasMore: false }) }));
jest.mock('../controllers/salaryController', () => new Proxy({}, { get: () => (req, res) => res.json({ ok: true }) }));
const own = require('../repositories/ownPayslipRepository');
const app = express();
app.use('/salaries', require('../routes/salaryRoutes'));

test('employee self endpoint ignores caller owner and returns no-store', async () => {
  const result = await request(app).get('/salaries/me?userId=000000000000000000000001&page=2');
  expect(result.status).toBe(200);
  expect(result.headers['cache-control']).toBe('no-store');
  expect(own.listOwnPayslips).toHaveBeenCalledWith(expect.objectContaining({ _id: mockIdentity }), '2');
});

test('self endpoint does not grant finance-wide salary routes', async () => {
  expect((await request(app).get('/salaries')).status).toBe(403);
  expect((await request(app).get('/salaries/000000000000000000000001')).status).toBe(403);
  expect((await request(app).post('/salaries')).status).toBe(403);
});
