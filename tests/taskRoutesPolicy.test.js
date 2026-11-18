const express = require('express');
const request = require('supertest');
const { ROLES } = require('../permissions/roles');
jest.mock('../middleware/authMiddleware', () => ({ protect: (req, res, next) => {
  req.user = { _id: '000000000000000000000001', roles: [req.get('X-Test-Role')] }; next();
} }));
jest.mock('../controllers/projectController', () => new Proxy({}, { get: () => (req, res) => res.json({ ok: true }) }));
jest.mock('../controllers/projectPlanController', () => new Proxy({}, { get: () => (req, res) => res.json({ ok: true }) }));
const app = express(); app.use(express.json());
app.use('/tasks', require('../routes/taskRoutes'));
app.use('/plans', require('../routes/projectPlanRoutes'));
const allowed = ['ceo_bd', 'pd_head', 'developer', 'uiux', 'dqa_head', 'dqa'];

test.each(ROLES)('%s task reads and plan visibility match the interim policy', async role => {
  expect((await request(app).get('/tasks/000000000000000000000001').set('X-Test-Role', role)).status).toBe(allowed.includes(role) ? 200 : 403);
  expect((await request(app).get('/plans/000000000000000000000001').set('X-Test-Role', role)).status).toBe(role === 'ceo_bd' ? 200 : 403);
  expect((await request(app).get('/tasks/000000000000000000000001/comments').set('X-Test-Role', role)).status).toBe(role === 'ceo_bd' ? 200 : 403);
});

test('unscoped upload and hard deletes fail closed even for CEO', async () => {
  expect((await request(app).post('/tasks/upload').set('X-Test-Role', 'ceo_bd')).status).toBe(403);
  expect((await request(app).delete('/tasks/000000000000000000000001').set('X-Test-Role', 'ceo_bd')).status).toBe(403);
  expect((await request(app).delete('/plans/000000000000000000000001/milestones/000000000000000000000002').set('X-Test-Role', 'ceo_bd')).status).toBe(403);
  expect((await request(app).put('/plans/000000000000000000000001/charter').set('X-Test-Role', 'ceo_bd')).status).toBe(403);
  expect((await request(app).post('/plans/000000000000000000000001/milestones').set('X-Test-Role', 'ceo_bd')).status).toBe(403);
  expect((await request(app).put('/plans/000000000000000000000001/milestones/000000000000000000000002').set('X-Test-Role', 'ceo_bd')).status).toBe(403);
});
