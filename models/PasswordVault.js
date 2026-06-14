const mongoose = require('mongoose');

const passwordVaultSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  url: {
    type: String,
    trim: true,
  },
  username: {
    type: String,
    trim: true,
  },
  encryptedPassword: {
    type: String,
    required: true,
  },
  iv: {
    type: String,
    required: true,
  },
  authTag: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    enum: ['hosting', 'email', 'social', 'admin', 'ftp', 'database', 'api', 'other'],
    default: 'other',
  },
  notes: {
    type: String,
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

passwordVaultSchema.index({ clientId: 1 });
passwordVaultSchema.index({ category: 1 });

module.exports = mongoose.model('PasswordVault', passwordVaultSchema);
