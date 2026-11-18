const Project = require('../models/Project');
const Task = require('../models/Task');
const TaskComment = require('../models/TaskComment');
const AuditLog = require('../models/AuditLog');
const sendResponse = require('../utils/response');
const { uploadToR2 } = require('../utils/r2Storage');
const { notifyTaskAssigned } = require('../services/telegramService');
const mongoose = require('mongoose');
const projectAccess = require('../permissions/projectAccess');
const taskAccess = require('../middleware/taskAccess');
const { transitionScope } = require('../permissions/taskTransitions');
const safeTaskFields = '_id projectId status priority due_date startDate estimatedHours actualHours assignedTo qaAssignedTo createdAt updatedAt';

const withTaskAudit = async (req, action, fields, callback) => {
  const session = await Task.db.startSession();
  try {
    let task;
    await session.withTransaction(async () => {
      task = await callback(session);
      if (task) await AuditLog.create([{ clientId: task._id, action, user: req.user.username || 'Core Team',
        details: { changedFields: fields } }], { session });
    });
    return task;
  } finally { await session.endSession(); }
};

const generateProjectKey = (name) => {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map(w => w[0]).join('').toUpperCase().slice(0, 6);
};

const projectFields = '_id name description projectKey clientId salesOwner projectType owner supportingOwner visitLead createdAt updatedAt';

exports.getProjects = async (req, res, next) => {
  if (!projectAccess.canReadProjects(req.user)) return sendResponse(res, 403, false, 'Not authorized');
  try {
    const projects = await Project.find(projectAccess.projectReadScope(req.user)).select(projectFields).sort({ createdAt: -1 }).lean();
    return sendResponse(res, 200, true, 'Projects fetched successfully', projects.map(row => projectAccess.presentProject(req.user, row)).filter(Boolean));
  } catch (error) { return next(error); }
};

exports.createProject = async (req, res, next) => {
  if (!projectAccess.canCreateProject(req.user)) return sendResponse(res, 403, false, 'Not authorized');
  try {
    const { name, description } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || (description !== undefined && typeof description !== 'string')) {
      return sendResponse(res, 400, false, 'Valid project name and description are required');
    }
    const key = generateProjectKey(name);
    let suffix = 0, projectKey = key;
    while (await Project.findOne({ projectKey })) projectKey = key + String(++suffix);
    const project = await Project.create({ name: name.trim(), description, projectKey });
    return sendResponse(res, 201, true, 'Project created successfully', projectAccess.presentProject(req.user, project));
  } catch (error) { return next(error); }
};

exports.getProject = async (req, res, next) => {
  if (!projectAccess.canReadProjects(req.user)) return sendResponse(res, 403, false, 'Not authorized');
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return sendResponse(res, 404, false, 'Project not found');
  try {
    const project = await Project.findOne({ $and: [{ _id: req.params.id }, projectAccess.projectReadScope(req.user)] }).select(projectFields).lean();
    if (!project) return sendResponse(res, 404, false, 'Project not found');
    const view = projectAccess.presentProject(req.user, project);
    if (!view) return sendResponse(res, 404, false, 'Project not found');
    return sendResponse(res, 200, true, 'Project fetched successfully', view);
  } catch (error) { return next(error); }
};

exports.getTasks = async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.projectId)) return sendResponse(res, 404, false, 'Project not found');
    const project = await Project.findById(req.params.projectId);
    if (!project) {
      return sendResponse(res, 404, false, 'Project not found');
    }

    let query = Task.find({ projectId: req.params.projectId });
    if (taskAccess.isCeo(req.user)) query = query.populate('assignedTo', 'username').populate('qaAssignedTo', 'username');
    else query = query.select(safeTaskFields);
    const tasks = await query.sort({ createdAt: -1 }).lean();

    sendResponse(res, 200, true, 'Tasks fetched successfully', tasks.map(task => taskAccess.presentTask(req.user, task)).filter(Boolean));
  } catch (error) {
    return next(error);
  }
};

exports.createTask = async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.projectId)) return sendResponse(res, 404, false, 'Project not found');
    const project = await Project.findById(req.params.projectId);
    if (!project) {
      return sendResponse(res, 404, false, 'Project not found');
    }
    if (!taskAccess.canCreateTaskInProject(req.user, project)) return sendResponse(res, 403, false, 'Not authorized');

    const { title, description, priority, due_date, estimatedHours, assignedTo, qaAssignedTo } = req.body;
    if (!title) {
      return sendResponse(res, 400, false, 'Task title is required');
    }

    const task = await withTaskAudit(req, 'TASK_CREATED', [], async session => {
      const [created] = await Task.create([{
      title,
      description: description || '',
      priority: priority || 'normal',
      due_date,
      estimatedHours,
      assignedTo,
      qaAssignedTo,
      projectId: req.params.projectId,
      }], { session });
      return created;
    });

    const populated = await Task.findById(task._id)
      .populate('assignedTo', 'username')
      .populate('qaAssignedTo', 'username');

    // Notify assigned user via Telegram
    if (assignedTo) {
      setTimeout(() => notifyTaskAssigned(task._id).catch(console.error), 0);
    }

    sendResponse(res, 201, true, 'Task created successfully', taskAccess.presentTask(req.user, populated));
  } catch (error) {
    return next(error);
  }
};

exports.updateTaskStatus = async (req, res, next) => {
  try {
    if (!req.taskScope || !mongoose.isObjectIdOrHexString(req.params.taskId)) return sendResponse(res, 404, false, 'Task not found');
    const { status } = req.body;
    if (!status) {
      return sendResponse(res, 400, false, 'Status is required');
    }

    const validStatuses = ['backlog', 'todo', 'in-progress', 'code-review', 'qa-testing', 'done'];
    if (!validStatuses.includes(status)) {
      return sendResponse(res, 400, false, 'Invalid status value');
    }

    const transition = transitionScope(req.user, status);
    if (!transition) return sendResponse(res, 403, false, 'Status transition is not authorized');

    const task = await withTaskAudit(req, 'TASK_STATUS_CHANGED', ['status'], session => Task.findOneAndUpdate(
      { $and: [{ _id: req.params.taskId }, transition] }, { status }, { new: true, runValidators: true, session }
    ));

    if (!task) {
      return sendResponse(res, 404, false, 'Task not found');
    }

    sendResponse(res, 200, true, 'Task status updated', taskAccess.presentTask(req.user, task));
  } catch (error) {
    return next(error);
  }
};

exports.updateTask = async (req, res, next) => {
  try {
    if (!req.taskScope || !mongoose.isObjectIdOrHexString(req.params.taskId)) return sendResponse(res, 404, false, 'Task not found');
    if (Object.hasOwn(req.body || {}, 'status')) return sendResponse(res, 400, false, 'Use the task status endpoint');
    const allowedFields = [
      'title',
      'description',
      'priority',
      'due_date',
      'startDate',
      'estimatedHours',
      'actualHours',
      'assignedTo',
      'qaAssignedTo',
      'checklist',
      'attachments',
    ];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Check if assignedTo actually changed
    let assignedToChanged = false;
    if (updates.assignedTo !== undefined) {
      const currentTask = await Task.findOne({ $and: [{ _id: req.params.taskId }, req.taskScope] }).select('assignedTo');
      if (currentTask && currentTask.assignedTo?.toString() !== updates.assignedTo) {
        assignedToChanged = true;
      }
    }

    const task = await withTaskAudit(req, 'TASK_UPDATED', Object.keys(updates), session => Task.findOneAndUpdate(
      { $and: [{ _id: req.params.taskId }, req.taskScope] },
      { $set: updates },
      { new: true, runValidators: true, session }
    )
      .populate('projectId', 'name projectKey')
      .populate('assignedTo', 'username')
      .populate('qaAssignedTo', 'username')
      .populate('attachments.uploadedBy', 'username'));

    if (!task) {
      return sendResponse(res, 404, false, 'Task not found');
    }

    // Notify assigned user via Telegram if assignment changed
    if (assignedToChanged) {
      setTimeout(() => notifyTaskAssigned(req.params.taskId).catch(console.error), 0);
    }

    sendResponse(res, 200, true, 'Task updated successfully', taskAccess.presentTask(req.user, task));
  } catch (error) {
    return next(error);
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.taskId);
    if (!task) {
      return sendResponse(res, 404, false, 'Task not found');
    }
    await TaskComment.deleteMany({ task_id: req.params.taskId });
    sendResponse(res, 200, true, 'Task deleted successfully');
  } catch (error) {
    console.error('Error in deleteTask:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getTask = async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.taskId)) return sendResponse(res, 404, false, 'Task not found');
    let query = Task.findById(req.params.taskId);
    if (taskAccess.isCeo(req.user)) query = query.populate('projectId', 'name projectKey')
      .populate('assignedTo', 'username').populate('qaAssignedTo', 'username').populate('attachments.uploadedBy', 'username');
    else query = query.select(safeTaskFields);
    const task = await query.lean();
    if (!task) {
      return sendResponse(res, 404, false, 'Task not found');
    }
    const view = taskAccess.presentTask(req.user, task);
    if (!view) return sendResponse(res, 404, false, 'Task not found');
    sendResponse(res, 200, true, 'Task fetched successfully', view);
  } catch (error) {
    return next(error);
  }
};

exports.uploadTaskAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return sendResponse(res, 400, false, 'No file uploaded');
    }
    const url = await uploadToR2(req.file);
    sendResponse(res, 200, true, 'Attachment uploaded successfully', {
      name: req.file.originalname,
      url,
      size: req.file.size,
    });
  } catch (error) {
    console.error('Error in uploadTaskAttachment:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getComments = async (req, res) => {
  try {
    const comments = await TaskComment.find({ task_id: req.params.taskId })
      .populate('user_id', 'username')
      .populate('reactions.users', 'username')
      .sort({ createdAt: 1 });
    sendResponse(res, 200, true, 'Comments fetched successfully', comments);
  } catch (error) {
    console.error('Error in getComments:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.addComment = async (req, res) => {
  try {
    const { message, images } = req.body;
    const textMessage = typeof message === 'string' ? message.trim() : '';
    const imageList = Array.isArray(images) ? images.filter(Boolean) : [];

    if (!textMessage && imageList.length === 0) {
      return sendResponse(res, 400, false, 'Comment must contain a message or at least one image');
    }

    const comment = await TaskComment.create({
      task_id: req.params.taskId,
      user_id: req.user._id,
      message: textMessage,
      images: imageList,
      reactions: [],
    });

    const populated = await TaskComment.findById(comment._id)
      .populate('user_id', 'username')
      .populate('reactions.users', 'username');

    sendResponse(res, 201, true, 'Comment added successfully', populated);
  } catch (error) {
    console.error('Error in addComment:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.toggleTaskCommentReaction = async (req, res) => {
  try {
    const { taskId, commentId } = req.params;
    const { emoji } = req.body;

    if (!emoji || typeof emoji !== 'string') {
      return sendResponse(res, 400, false, 'Emoji is required');
    }

    const comment = await TaskComment.findOne({ _id: commentId, task_id: taskId });
    if (!comment) {
      return sendResponse(res, 404, false, 'Comment not found');
    }

    if (!comment.reactions) {
      comment.reactions = [];
    }

    const userIdStr = req.user._id.toString();
    const existingReactionIndex = comment.reactions.findIndex((r) => r.emoji === emoji);

    if (existingReactionIndex > -1) {
      const userIndex = comment.reactions[existingReactionIndex].users.findIndex(
        (u) => (u._id || u).toString() === userIdStr
      );

      if (userIndex > -1) {
        // Toggle off
        comment.reactions[existingReactionIndex].users.splice(userIndex, 1);
        if (comment.reactions[existingReactionIndex].users.length === 0) {
          comment.reactions.splice(existingReactionIndex, 1);
        }
      } else {
        // Add user reaction
        comment.reactions[existingReactionIndex].users.push(req.user._id);
      }
    } else {
      comment.reactions.push({
        emoji,
        users: [req.user._id],
      });
    }

    await comment.save();

    const populated = await TaskComment.findById(comment._id)
      .populate('user_id', 'username')
      .populate('reactions.users', 'username');

    sendResponse(res, 200, true, 'Reaction updated successfully', populated);
  } catch (error) {
    console.error('Error in toggleTaskCommentReaction:', error);
    sendResponse(res, 500, false, error.message);
  }
};
