const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  projectKey: { type: String, required: true, unique: true, uppercase: true, trim: true },
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
