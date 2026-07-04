const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  status: {
    type: String,
    enum: ['backlog', 'todo', 'in-progress', 'code-review', 'qa-testing', 'done'],
    default: 'todo'
  },
  priority: {
    type: String,
    enum: ['urgent', 'high', 'normal', 'low'],
    default: 'normal'
  },
  due_date: { type: Date },
  estimatedHours: { type: Number, min: 0 },
  actualHours: { type: Number, min: 0 },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  qaAssignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
}, { timestamps: true });

taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ assignedTo: 1 });

module.exports = mongoose.model('Task', taskSchema);
