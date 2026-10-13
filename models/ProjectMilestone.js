const mongoose = require('mongoose');

const projectMilestoneSchema = new mongoose.Schema({
  project_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  },
  phase_name: {
    type: String,
    required: true,
    trim: true,
  },
  start_date: {
    type: Date,
    required: true,
  },
  end_date: {
    type: Date,
    required: true,
  },
  release_version: {
    type: String,
    default: 'v1.0',
    trim: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'In-Progress', 'Completed'],
    default: 'Pending',
  },
  notes: {
    type: String,
    default: '',
    trim: true,
  },
  sort_order: {
    type: Number,
    default: 0,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

// Export with collection name 'project_milestones' as specified
module.exports = mongoose.model('ProjectMilestone', projectMilestoneSchema, 'project_milestones');
