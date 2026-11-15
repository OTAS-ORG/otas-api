const express = require('express');
const request = require('supertest');
const { ROLES } = require('../permissions/roles');

// Keep the real authorization guards; substitute only token authentication and
// controller/database work so the test verifies routing cannot skip guards.
jest.mock('../middleware/authMiddleware', () => {
  const actual = jest.requireActual('../middleware/authMiddleware');
  return { ...actual, protect: (req, res, next) => {
    if (!req.get('X-Test-Roles')) return res.status(401).json({ success: false });
    req.user = { _id: 'fictional', roles: req.get('X-Test-Roles').split(','), role: req.get('X-Legacy-Role'),
      departments: req.get('X-Legacy-Sales') ? [{ name: 'Sales' }] : [] };
    next();
  } };
});
jest.mock('../controllers/passwordController', () => new Proxy({}, { get: () => (req, res) => res.status(200).json({ ok: true }) }));
jest.mock('../controllers/projectController', () => new Proxy({}, { get: () => (req, res) => res.status(200).json({ ok: true }) }));
jest.mock('../controllers/projectPlanController', () => new Proxy({}, { get: () => (req, res) => res.status(200).json({ ok: true }) }));

const app = express();
app.use(express.json());
app.use('/passwords', require('../routes/passwordRoutes'));
app.use('/projects', require('../routes/projectRoutes'));
app.use('/plans', require('../routes/projectPlanRoutes'));
app.use('/tasks', require('../routes/taskRoutes'));

const vaultRequests = [
  ['get', '/passwords'], ['get', '/passwords/fictional'], ['post', '/passwords'],
  ['put', '/passwords/fictional'], ['delete', '/passwords/fictional'], ['post', '/passwords/fictional/decrypt'],
];
const projectRequests = [
  ['get', '/projects'], ['post', '/projects'], ['get', '/projects/fictional'],
  ['get', '/projects/fictional/tasks'], ['post', '/projects/fictional/tasks'],
  ['get', '/plans/widget/summary'], ['get', '/plans/fictional'], ['put', '/plans/fictional/charter'],
  ['get', '/plans/fictional/milestones'], ['post', '/plans/fictional/milestones'],
  ['put', '/plans/fictional/milestones/entry'], ['delete', '/plans/fictional/milestones/entry'],
  ['post', '/tasks/upload'], ['get', '/tasks/fictional'], ['patch', '/tasks/fictional/status'],
  ['put', '/tasks/fictional'], ['delete', '/tasks/fictional'], ['get', '/tasks/fictional/comments'],
  ['post', '/tasks/fictional/comments'], ['post', '/tasks/fictional/comments/entry/reactions'],
];

test.each(ROLES)('vault routes are restricted for %s', async (role) => {
  for (const [method, path] of vaultRequests) {
    const res = await request(app)[method](path).set('X-Test-Roles', role);
    expect(res.status).toBe(role === 'ceo_bd' ? 200 : 403);
  }
});

test('vault endpoints require authentication', async () => {
  for (const [method, path] of vaultRequests) expect((await request(app)[method](path)).status).toBe(401);
});

test.each(['sales', 'sales,developer', 'sales,finance_admin'])('unscoped project routes deny %s', async (roles) => {
  for (const [method, path] of projectRequests) {
    const res = await request(app)[method](path).set('X-Test-Roles', roles);
    expect(res.status).toBe(403);
  }
});

test('CEO keeps project access even when holding sales role', async () => {
  expect((await request(app).get('/projects').set('X-Test-Roles', 'ceo_bd,sales')).status).toBe(200);
});

test('legacy Sales department users cannot bypass the restriction through Admin role', async () => {
  expect((await request(app).get('/projects').set('X-Test-Roles', 'developer').set('X-Legacy-Role', 'Admin').set('X-Legacy-Sales', 'yes')).status).toBe(403);
});
