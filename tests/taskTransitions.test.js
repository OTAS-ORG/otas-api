const mongoose = require('mongoose');
const { transitionScope } = require('../permissions/taskTransitions');
const id = new mongoose.Types.ObjectId();
const user = (...roles) => ({ _id: id, roles });

test('assigned developer can only begin work or submit to review', () => {
  expect(transitionScope(user('developer'), 'in-progress')).toEqual({ $or: [{ status: 'todo', assignedTo: id }] });
  expect(transitionScope(user('developer'), 'code-review')).toEqual({ $or: [{ status: 'in-progress', assignedTo: id }] });
  expect(transitionScope(user('developer'), 'done')).toBeNull();
  expect(transitionScope(user('developer'), 'qa-testing')).toBeNull();
});

test('assigned QA can pass or return QA but cannot skip review', () => {
  expect(transitionScope(user('dqa'), 'done')).toEqual({ $or: [{ status: 'qa-testing', qaAssignedTo: id }] });
  expect(transitionScope(user('dqa'), 'qa-testing')).toBeNull();
});

test('CEO can submit a reviewed task to QA but cannot bypass QA to done', () => {
  expect(transitionScope(user('ceo_bd'), 'qa-testing')).toEqual({ $or: [{ status: 'code-review' }] });
  expect(transitionScope(user('ceo_bd'), 'done')).toBeNull();
  expect(transitionScope(user('ceo_bd', 'dqa'), 'done')).toEqual({ $or: [{ status: 'qa-testing', qaAssignedTo: id }] });
});

test('invalid identity or absent role never creates a query scope', () => {
  expect(transitionScope({ _id: 'invalid', roles: ['ceo_bd'] }, 'qa-testing')).toBeNull();
  expect(transitionScope(user('sales'), 'done')).toBeNull();
});
