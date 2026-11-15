const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  projectKey: { type: String, required: true, unique: true, uppercase: true, trim: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
  projectType: { type: String, enum: ['package', 'custom', null], default: null },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  supportingOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  visitLead: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

projectSchema.index({ owner: 1 });
projectSchema.index({ clientId: 1 });

module.exports = mongoose.model('Project', projectSchema);
