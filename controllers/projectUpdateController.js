const mongoose = require('mongoose');
const Project = require('../models/Project');
const AuditLog = require('../models/AuditLog');
const sendResponse = require('../utils/response');
const { presentProject } = require('../permissions/projectAccess');

// Scope the ownership check to the actual update, avoiding a check-then-write race.
exports.updateProject = async (req, res, next) => {
  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  const isCeo = roles.includes('ceo_bd');
  const isHead = roles.some(role => ['pd_head', 'dqa_head'].includes(role));
  if (!isCeo && !isHead) return sendResponse(res, 403, false, 'Not authorized');
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return sendResponse(res, 404, false, 'Project not found');
  if (!isCeo && !mongoose.isObjectIdOrHexString(req.user._id)) return sendResponse(res, 403, false, 'Not authorized');
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['name', 'description'].includes(key)) ||
      (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) ||
      (body.description !== undefined && typeof body.description !== 'string') || !Object.keys(body).length) {
    return sendResponse(res, 400, false, 'Invalid project update');
  }
  const updates = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description;
  const filter = { _id: req.params.id, ...(!isCeo ? { owner: req.user._id } : {}) };
  try {
    const session = await Project.db.startSession();
    let project;
    try {
      await session.withTransaction(async () => {
        project = await Project.findOneAndUpdate(filter, { $set: updates }, { new: true, runValidators: true, session }).lean();
        if (project) await AuditLog.create([{ clientId: project._id, action: 'PROJECT_UPDATED',
          user: req.user.username || 'Core Team', details: { changedFields: Object.keys(updates) } }], { session });
      });
    } finally { await session.endSession(); }
    if (!project) return sendResponse(res, 404, false, 'Project not found');
    return sendResponse(res, 200, true, 'Project updated successfully', presentProject(req.user, project));
  } catch (error) { return next(error); }
};
