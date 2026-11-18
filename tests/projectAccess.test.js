const mongoose = require('mongoose');
const { ROLES } = require('../permissions/roles');
const { canReadProjects, canCreateProject, canSeeProjectText, presentProject } = require('../permissions/projectAccess');
const { assertMoneyFree } = require('./helpers/moneySweep');

test.each(ROLES)('project role %s follows the project visibility matrix', role => {
  const user = { _id: new mongoose.Types.ObjectId(), roles: [role] };
  expect(canReadProjects(user)).toBe(['ceo_bd', 'finance_admin', 'pd_head', 'developer', 'uiux', 'dqa_head', 'dqa'].includes(role));
  expect(canCreateProject(user)).toBe(false);
  expect(canSeeProjectText(user)).toBe(role === 'ceo_bd');
});

test('role union preserves PD visibility while sales alone remains denied', () => {
  const id = new mongoose.Types.ObjectId();
  expect(canReadProjects({ _id: id, roles: ['sales'] })).toBe(false);
  expect(canReadProjects({ _id: id, roles: ['sales', 'pd_head'] })).toBe(true);
  expect(canSeeProjectText({ _id: id, roles: ['sales', 'pd_head'] })).toBe(false);
  expect(canReadProjects({ roles: ['ceo_bd'] })).toBe(false);
});

test('non-price projection replaces unclassified project text with stable aliases', () => {
  const user = { _id: new mongoose.Types.ObjectId(), roles: ['developer'] };
  const project = { _id: new mongoose.Types.ObjectId(), name: 'USD 100 project', description: '1 သိန်း discount', projectKey: 'MMK', contractValue: 100, owner: new mongoose.Types.ObjectId() };
  const view = presentProject(user, project);
  expect(view.name).toBe(`Project ${String(project._id).slice(-8).toUpperCase()}`);
  expect(view.description).toBe('');
  expect(view.projectKey).toBe(`PRJ${String(project._id).slice(-8).toUpperCase()}`);
  expect(view.contractValue).toBeUndefined();
  expect(() => assertMoneyFree(view)).not.toThrow();
});

test('CEO retains project text but unknown fields remain excluded', () => {
  const view = presentProject({ _id: 'fictional', roles: ['ceo_bd'] }, { _id: 'fictional', name: 'Fictional project', description: 'Details', projectKey: 'ABC', unknown: 'secret' });
  expect(view).toEqual({ _id: 'fictional', name: 'Fictional project', description: 'Details', projectKey: 'ABC' });
});

test('finance cannot see unclassified project text which may contain CEO-only cost', () => {
  const user = { _id: new mongoose.Types.ObjectId(), roles: ['finance_admin'] };
  const project = { _id: new mongoose.Types.ObjectId(), name: 'USD cost', description: '10 သိန်း', projectKey: 'MMK' };
  const view = presentProject(user, project);
  expect(view.description).toBe('');
  expect(view.name).toMatch(/^Project [A-F0-9]{8}$/);
  expect(() => assertMoneyFree(view)).not.toThrow();
  expect(canSeeProjectText({ ...user, roles: ['finance_admin', 'ceo_bd'] })).toBe(true);
});

test('non-price projection fails closed for malformed legacy IDs and fields', () => {
  const user = { _id: new mongoose.Types.ObjectId(), roles: ['dqa'] };
  expect(presentProject(user, { _id: 'USD 500' })).toBeNull();
  const result = presentProject(user, { _id: new mongoose.Types.ObjectId(), projectType: 'USD 50', owner: '100 MMK', createdAt: '5 သိန်း' });
  expect(result.projectType).toBeUndefined();
  expect(result.owner).toBeUndefined();
  expect(result.createdAt).toBeUndefined();
  expect(() => assertMoneyFree(result)).not.toThrow();
});
