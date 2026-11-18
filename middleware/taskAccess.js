const mongoose = require('mongoose');
const sendResponse = require('../utils/response');

const TASK_READ_ROLES = ['ceo_bd', 'pd_head', 'developer', 'uiux', 'dqa_head', 'dqa'];
const ASSIGNEE_ROLES = ['developer', 'uiux', 'dqa'];
const denied = res => sendResponse(res, 403, false, 'You are not authorized', null, 'NOT_AUTHORIZED');
const hasRole = (user, roles) => Array.isArray(user?.roles) && user.roles.some(role => roles.includes(role));
const isCeo = user => hasRole(user, ['ceo_bd']);
const requireTaskRead = (req, res, next) => hasRole(req.user, TASK_READ_ROLES) ? next() : denied(res);
const requireCeo = (req, res, next) => isCeo(req.user) ? next() : denied(res);
const noHardDelete = (req, res) => denied(res);

// Always add assignment scope to the actual mutation query. Project-head
// writes remain disabled until ownership can be checked atomically.
const taskWriteScope = async (user, extended) => {
  if (isCeo(user)) return {};
  if (!mongoose.isObjectIdOrHexString(user?._id)) return { _id: { $in: [] } };
  const id = new mongoose.Types.ObjectId(user._id.toString());
  const clauses = [];
  if (!extended && hasRole(user, ASSIGNEE_ROLES)) clauses.push({ $or: [{ assignedTo: id }, { qaAssignedTo: id }] });
  return clauses.length ? { $or: clauses } : { _id: { $in: [] } };
};
const prepareTaskWrite = async (req, res, next) => {
  try {
    if (!hasRole(req.user, TASK_READ_ROLES)) return denied(res);
    const allowedSelf = new Set(['status']);
    const keys = Object.keys(req.body || {});
    const extended = keys.some(key => !allowedSelf.has(key));
    req.taskScope = await taskWriteScope(req.user, extended);
    return next();
  } catch (error) { return next(error); }
};
const canCreateTaskInProject = user => isCeo(user);

// Free-form titles, descriptions, checklist text, attachment links, and
// comments may contain money and cannot safely be returned to non-price roles.
const presentTask = (user, task) => {
  if (isCeo(user)) return task;
  const value = typeof task.toObject === 'function' ? task.toObject() : task;
  if (!value || !mongoose.isObjectIdOrHexString(value._id)) return null;
  const safe = { _id: value._id };
  if (['backlog', 'todo', 'in-progress', 'code-review', 'qa-testing', 'done'].includes(value.status)) safe.status = value.status;
  if (['urgent', 'high', 'normal', 'low'].includes(value.priority)) safe.priority = value.priority;
  for (const key of ['due_date', 'startDate', 'createdAt', 'updatedAt'])
    if (value[key] instanceof Date && Number.isFinite(value[key].getTime())) safe[key] = value[key];
  for (const key of ['estimatedHours', 'actualHours'])
    if (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0) safe[key] = value[key];
  for (const key of ['projectId', 'assignedTo', 'qaAssignedTo']) {
    const id = value[key]?._id || value[key];
    if (mongoose.isObjectIdOrHexString(id)) safe[key] = id;
  }
  safe.title = 'Task';
  return safe;
};
module.exports = { requireTaskRead, requireCeo, noHardDelete, prepareTaskWrite,
  taskWriteScope, canCreateTaskInProject, presentTask, isCeo };
