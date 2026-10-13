const mongoose = require('mongoose');

const projectPlanSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    unique: true,
  },
  charterContent: {
    type: String,
    default: '',
  },
  scope: {
    type: String,
    default: '',
  },
  goals: {
    type: String,
    default: '',
  },
  risks: {
    type: String,
    default: '',
  },
  targetReleaseVersion: {
    type: String,
    default: '',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

module.exports = mongoose.model('ProjectPlan', projectPlanSchema);
