const Milestone = require('../models/ProjectMilestone');
const controller = require('../controllers/projectPlanController');
const Project = require('../models/Project');
const ProjectPlan = require('../models/ProjectPlan');
afterEach(() => jest.restoreAllMocks());

test('milestone update lookup requires both URL project and milestone IDs', async () => {
  const lookup = jest.spyOn(Milestone, 'findOne').mockResolvedValue(null);
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const params = { id: '000000000000000000000001', projectId: '000000000000000000000002' };
  await controller.updateMilestone({ params, body: { phase_name: 'fictional' } }, res);
  expect(lookup).toHaveBeenCalledWith({ _id: params.id, project_id: params.projectId });
  expect(res.status).toHaveBeenCalledWith(404);
});

test('getting a missing project plan is read-only', async () => {
  jest.spyOn(Project, 'findById').mockResolvedValue({ _id: '000000000000000000000002' });
  jest.spyOn(ProjectPlan, 'findOne').mockReturnValue({ populate: () => ({ populate: async () => null }) });
  jest.spyOn(Milestone, 'find').mockReturnValue({ sort: () => ({ populate: async () => [] }) });
  const create = jest.spyOn(ProjectPlan, 'create');
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.getProjectPlan({ params: { projectId: '000000000000000000000002' } }, res);
  expect(create).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ plan: null }) }));
});
