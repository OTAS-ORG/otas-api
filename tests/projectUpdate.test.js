const mongoose = require('mongoose');
const Project = require('../models/Project');
const AuditLog = require('../models/AuditLog');
const { updateProject } = require('../controllers/projectUpdateController');

const owner = new mongoose.Types.ObjectId();
const project = new mongoose.Types.ObjectId();
const user = roles => ({ _id: owner, roles });
const response = () => { const res = {}; res.status = jest.fn().mockReturnValue(res); res.json = jest.fn().mockReturnValue(res); return res; };
afterEach(() => jest.restoreAllMocks());

test('head updates only an owned project using an atomic database predicate', async () => {
  const session = { withTransaction: async callback => callback(), endSession: jest.fn() };
  jest.spyOn(Project.db, 'startSession').mockResolvedValue(session);
  const audit = jest.spyOn(AuditLog, 'create').mockResolvedValue([]);
  const spy = jest.spyOn(Project, 'findOneAndUpdate').mockReturnValue({ lean: async () => ({ _id: project }) });
  const res = response();
  await updateProject({ user: user(['pd_head']), params: { id: project.toString() }, body: { name: 'Fictional' } }, res, jest.fn());
  expect(spy).toHaveBeenCalledWith({ _id: project.toString(), owner }, { $set: { name: 'Fictional' } }, expect.objectContaining({ runValidators: true, session }));
  expect(audit).toHaveBeenCalledWith([expect.objectContaining({ action: 'PROJECT_UPDATED' })], { session });
  expect(res.status).toHaveBeenCalledWith(200);
});

test('a head cannot set ownership or change fields outside the allowlist', async () => {
  const spy = jest.spyOn(Project, 'findOneAndUpdate'); const res = response();
  await updateProject({ user: user(['pd_head']), params: { id: project.toString() }, body: { owner: owner.toString() } }, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400); expect(spy).not.toHaveBeenCalled();
});

test('a non-head cannot update a project', async () => {
  const spy = jest.spyOn(Project, 'findOneAndUpdate'); const res = response();
  await updateProject({ user: user(['developer']), params: { id: project.toString() }, body: { name: 'Fictional' } }, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(403); expect(spy).not.toHaveBeenCalled();
});
