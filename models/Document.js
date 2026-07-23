const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Document name is required'],
    trim: true,
  },
  url: {
    type: String,
    required: [true, 'Document URL is required'],
  },
  type: {
    type: String,
    trim: true,
  },
  size: {
    type: Number,
    required: true,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
  },
}, {
  timestamps: true,
});

documentSchema.index({ name: 1 });
documentSchema.index({ client: 1 });
documentSchema.index({ project: 1 });
documentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Document', documentSchema);
