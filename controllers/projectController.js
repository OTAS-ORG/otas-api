const Project = require('../models/Project');
const Task = require('../models/Task');
const TaskComment = require('../models/TaskComment');
const sendResponse = require('../utils/response');
const { uploadToR2 } = require('../utils/r2Storage');
const { notifyTaskAssigned } = require('../services/telegramService');

const generateProjectKey = (name) => {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map(w => w[0]).join('').toUpperCase().slice(0, 6);
};

exports.getProjects = async (req, res) => {
  try {
    const projects = await Project.find()
      .sort({ createdAt: -1 });
    sendResponse(res, 200, true, 'Projects fetched successfully', projects);
  } catch (error) {
    console.error('Error in getProjects:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.createProject = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return sendResponse(res, 400, false, 'Project name is required');
    }

    let projectKey = generateProjectKey(name);

    // Ensure uniqueness by appending number if needed
    let suffix = 0;
    let candidateKey = projectKey;
    while (await Project.findOne({ projectKey: candidateKey })) {
      suffix++;
      candidateKey = `${projectKey}${suffix}`;
    }
    projectKey = candidateKey;

    const project = await Project.create({ name, description, projectKey });
    sendResponse(res, 201, true, 'Project created successfully', project);
  } catch (error) {
    console.error('Error in createProject:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return sendResponse(res, 404, false, 'Project not found');
    }
    sendResponse(res, 200, true, 'Project fetched successfully', project);
  } catch (error) {
    console.error('Error in getProject:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getTasks = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) {
      return sendResponse(res, 404, false, 'Project not found');
    }

    const tasks = await Task.find({ projectId: req.params.projectId })
      .populate('assignedTo', 'username')
      .populate('qaAssignedTo', 'username')
      .sort({ createdAt: -1 });

    sendResponse(res, 200, true, 'Tasks fetched successfully', tasks);
  } catch (error) {
    console.error('Error in getTasks:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.createTask = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) {
      return sendResponse(res, 404, false, 'Project not found');
    }

    const { title, description, priority, due_date, estimatedHours, assignedTo, qaAssignedTo } = req.body;
    if (!title) {
      return sendResponse(res, 400, false, 'Task title is required');
    }

    const task = await Task.create({
      title,
      description: description || '',
      priority: priority || 'normal',
      due_date,
      estimatedHours,
      assignedTo,
      qaAssignedTo,
      projectId: req.params.projectId,
    });

    const populated = await Task.findById(task._id)
      .populate('assignedTo', 'username')
      .populate('qaAssignedTo', 'username');

    // Notify assigned user via Telegram
    if (assignedTo) {
      setTimeout(() => notifyTaskAssigned(task._id).catch(console.error), 0);
    }

    sendResponse(res, 201, true, 'Task created successfully', populated);
  } catch (error) {
    console.error('Error in createTask:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return sendResponse(res, 400, false, 'Status is required');
    }

    const validStatuses = ['backlog', 'todo', 'in-progress', 'code-review', 'qa-testing', 'done'];
    if (!validStatuses.includes(status)) {
      return sendResponse(res, 400, false, 'Invalid status value');
    }

    const task = await Task.findByIdAndUpdate(
      req.params.taskId,
      { status },
      { new: true }
    );

    if (!task) {
      return sendResponse(res, 404, false, 'Task not found');
    }

    sendResponse(res, 200, true, 'Task status updated', task);
  } catch (error) {
    console.error('Error in updateTaskStatus:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.updateTask = async (req, res) => {
  try {
    const allowedFields = [
      'title',
      'description',
      'status',
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
      const currentTask = await Task.findById(req.params.taskId).select('assignedTo');
      if (currentTask && currentTask.assignedTo?.toString() !== updates.assignedTo) {
        assignedToChanged = true;
      }
    }

    const task = await Task.findByIdAndUpdate(
      req.params.taskId,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate('projectId', 'name projectKey')
      .populate('assignedTo', 'username')
      .populate('qaAssignedTo', 'username')
      .populate('attachments.uploadedBy', 'username');

    if (!task) {
      return sendResponse(res, 404, false, 'Task not found');
    }

    // Notify assigned user via Telegram if assignment changed
    if (assignedToChanged) {
      setTimeout(() => notifyTaskAssigned(req.params.taskId).catch(console.error), 0);
    }

    sendResponse(res, 200, true, 'Task updated successfully', task);
  } catch (error) {
    console.error('Error in updateTask:', error);
    sendResponse(res, 500, false, error.message);
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

exports.getTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId)
      .populate('projectId', 'name projectKey')
      .populate('assignedTo', 'username')
      .populate('qaAssignedTo', 'username')
      .populate('attachments.uploadedBy', 'username');
    if (!task) {
      return sendResponse(res, 404, false, 'Task not found');
    }
    sendResponse(res, 200, true, 'Task fetched successfully', task);
  } catch (error) {
    console.error('Error in getTask:', error);
    sendResponse(res, 500, false, error.message);
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
