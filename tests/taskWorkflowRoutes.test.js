const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const AuditLog = require('../models/AuditLog');
const mockUserId = new mongoose.Types.ObjectId();
const taskId = new mongoose.Types.ObjectId();

jest.mock('../middleware/authMiddleware', () => ({ protect: (req, res, next) => {
  req.user = { _id: mockUserId, username: 'fictional', roles: (req.get('X-Roles') || 'developer').split(',') };
  next();
} }));

const app = express();
app.use(express.json());
app.use('/tasks', require('../routes/taskRoutes'));
afterEach(() => jest.restoreAllMocks());

test('developer cannot skip review/QA or bypass workflow using the generic update endpoint', async () => {
  const write = jest.spyOn(Task, 'findOneAndUpdate');
  expect((await request(app).patch(`/tasks/${taskId}/status`).send({ status: 'done' })).status).toBe(403);
  expect((await request(app).patch(`/tasks/${taskId}/status`).send({ status: 'qa-testing' })).status).toBe(403);
  expect((await request(app).put(`/tasks/${taskId}`).send({ status: 'done' })).status).toBe(400);
  expect(write).not.toHaveBeenCalled();
});

test('status update scopes assignment and previous status in the same transactional write', async () => {
  const session = { withTransaction: async fn => fn(), endSession: jest.fn() };
  jest.spyOn(Task.db, 'startSession').mockResolvedValue(session);
  const audit = jest.spyOn(AuditLog, 'create').mockResolvedValue([]);
  const write = jest.spyOn(Task, 'findOneAndUpdate').mockResolvedValue({ _id: taskId, status: 'in-progress', assignedTo: mockUserId });
  const result = await request(app).patch(`/tasks/${taskId}/status`).send({ status: 'in-progress' });
  expect(result.status).toBe(200);
  expect(write).toHaveBeenCalledWith({ $and: [{ _id: taskId.toString() }, { $or: [{ status: 'todo', assignedTo: mockUserId }] }] },
    { status: 'in-progress' }, expect.objectContaining({ session }));
  expect(audit).toHaveBeenCalledWith([expect.objectContaining({ action: 'TASK_STATUS_CHANGED' })], { session });
});
