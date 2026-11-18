const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const Project = require('../models/Project');
const controller = require('../controllers/projectController');

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = { _id: new mongoose.Types.ObjectId(), roles: (req.get('X-Roles') || '').split(',') }; next(); });
app.get('/projects', controller.getProjects);
app.post('/projects', controller.createProject);
app.get('/projects/:id', controller.getProject);
afterEach(() => jest.restoreAllMocks());

test('sales alone and marketing cannot list or read projects and do not query storage', async () => {
  const find = jest.spyOn(Project, 'find');
  const findById = jest.spyOn(Project, 'findById');
  for (const role of ['sales', 'marketing_head']) {
    expect((await request(app).get('/projects').set('X-Roles', role)).status).toBe(403);
    expect((await request(app).get('/projects/000000000000000000000001').set('X-Roles', role)).status).toBe(403);
  }
  expect(find).not.toHaveBeenCalled();
  expect(findById).not.toHaveBeenCalled();
});

test('direct project creation stays blocked until confirm_won exists', async () => {
  const create = jest.spyOn(Project, 'create');
  for (const role of ['ceo_bd', 'finance_admin', 'developer', 'sales,pd_head']) {
    expect((await request(app).post('/projects').set('X-Roles', role).send({ name: 'Fictional' })).status).toBe(403);
  }
  expect(create).not.toHaveBeenCalled();
});

test('developer and finance list and detail do not reveal unclassified or extra money fields', async () => {
  const id = new mongoose.Types.ObjectId();
  const project = { _id: id, name: 'USD 500', description: '5 သိန်း', projectKey: 'MMK', hiddenPrice: 999 };
  const query = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([project]) };
  jest.spyOn(Project, 'find').mockReturnValue(query);
  const detail = { select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(project) };
  jest.spyOn(Project, 'findById').mockReturnValue(detail);
  for (const role of ['developer', 'finance_admin']) {
    for (const path of ['/projects', `/projects/${id}`]) {
      const res = await request(app).get(path).set('X-Roles', role);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body.data)).not.toMatch(/USD|MMK|သိန်း|hiddenPrice|999/);
    }
  }
});
