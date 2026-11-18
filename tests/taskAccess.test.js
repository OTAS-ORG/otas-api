const mongoose = require('mongoose');
const { taskWriteScope, presentTask, canCreateTaskInProject } = require('../middleware/taskAccess');
const { ROLES } = require('../permissions/roles');

const id = new mongoose.Types.ObjectId();
const user = roles => ({ _id: id, roles });

test('assigned worker status scope is bound to the authenticated user', async () => {
  const scope = await taskWriteScope(user(['developer']), false);
  expect(scope).toEqual({ $or: [{ $or: [{ assignedTo: id }, { qaAssignedTo: id }] }] });
  expect(await taskWriteScope(user(['developer']), true)).toEqual({ _id: { $in: [] } });
});

test.each(ROLES.filter(role => role !== 'ceo_bd'))('%s cannot create tasks in legacy projects', role => {
  expect(canCreateTaskInProject(user([role]), { owner: id })).toBe(false);
});

test('CEO may create and mutate tasks; head ownership alone grants no write yet', async () => {
  expect(canCreateTaskInProject(user(['ceo_bd']), {})).toBe(true);
  expect(await taskWriteScope(user(['ceo_bd']), true)).toEqual({});
  expect(await taskWriteScope(user(['pd_head']), true)).toEqual({ _id: { $in: [] } });
  expect(await taskWriteScope(user(['pd_head']), false)).toEqual({ _id: { $in: [] } });
  expect(await taskWriteScope(user(['pd_head', 'developer']), false)).toEqual({ $or: [{ $or: [{ assignedTo: id }, { qaAssignedTo: id }] }] });
});

test('non-price output omits unclassified text and validates legacy fields', () => {
  const task = { _id: new mongoose.Types.ObjectId(), projectId: new mongoose.Types.ObjectId(),
    title: 'Secret $50,000', description: '100 MMK', status: 'Paid 5000 MMK', priority: '$200',
    due_date: '500 MMK', estimatedHours: '$300', attachments: [{ url: 'https://example.invalid/price=3' }] };
  const result = presentTask(user(['developer']), task);
  expect(result).toEqual({ _id: task._id, projectId: task.projectId, title: 'Task' });
  expect(JSON.stringify(result)).not.toMatch(/MMK|\$/);
  expect(presentTask(user(['developer']), { _id: 'price: $1000' })).toBeNull();
});
