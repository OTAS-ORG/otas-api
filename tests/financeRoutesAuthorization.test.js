const express = require('express');
const request = require('supertest');
const { ROLES } = require('../permissions/roles');

// Exercise the actual routers and CASL middleware, replacing authentication and
// persistence with fictional fixtures. No production server or database is used.
jest.mock('../middleware/authMiddleware', () => ({
  protect: (req, res, next) => { req.user = { _id: 'fictional-user', roles: [req.get('X-Test-Role')] }; next(); },
}));
jest.mock('../controllers/invoiceController', () => new Proxy({}, { get: () => (req, res) => res.json({ ok: true }) }));
jest.mock('../controllers/salaryController', () => new Proxy({}, { get: () => (req, res) => res.json({ ok: true }) }));
jest.mock('../controllers/analyticsController', () => ({ getDashboard: (req, res) => res.json({ ok: true }) }));

const app = express();
app.use('/invoices', require('../routes/invoiceRoutes'));
app.use('/salaries', require('../routes/salaryRoutes'));
app.use('/analytics', require('../routes/analyticsRoutes'));

test.each(ROLES)('finance routes enforce the finance class for %s', async (role) => {
  const allowed = ['ceo_bd', 'finance_admin'].includes(role);
  for (const path of ['/invoices', '/salaries', '/analytics']) {
    const res = await request(app).get(path).set('X-Test-Role', role);
    expect(res.status).toBe(allowed ? 200 : 403);
    if (!allowed) expect(res.body.code).toBe('NOT_AUTHORIZED');
  }
});
