const mongoose = require('mongoose');

// Transition predicates are part of the write query: checking a task first and
// writing later would allow a concurrent status or assignment change to bypass a gate.
const transitionScope = (user, target) => {
  if (!user?._id || !mongoose.isObjectIdOrHexString(user._id) || !Array.isArray(user.roles)) return null;
  const id = new mongoose.Types.ObjectId(user._id.toString());
  const roles = user.roles;
  const clauses = [];
  if (roles.includes('ceo_bd')) {
    if (target === 'todo') clauses.push({ status: 'backlog' });
    if (target === 'in-progress') clauses.push({ status: 'todo' }, { status: 'code-review' });
    if (target === 'code-review') clauses.push({ status: 'in-progress' });
    if (target === 'qa-testing') clauses.push({ status: 'code-review' });
  }
  if (roles.some(role => ['developer', 'uiux', 'dqa'].includes(role))) {
    if (target === 'in-progress') clauses.push({ status: 'todo', assignedTo: id });
    if (target === 'code-review') clauses.push({ status: 'in-progress', assignedTo: id });
  }
  if (roles.some(role => ['dqa', 'dqa_head'].includes(role)) && ['done', 'in-progress'].includes(target)) {
    clauses.push({ status: 'qa-testing', qaAssignedTo: id });
  }
  return clauses.length ? { $or: clauses } : null;
};
module.exports = { transitionScope };
