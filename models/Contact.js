const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  phone: {
    type: String,
    trim: true,
    default: '',
  },
  serviceType: {
    type: String,
    required: [true, 'Service type is required'],
    enum: ['POS System', 'AI Agent', 'ERP System', 'E-Commerce', 'Software Development', 'Website Development', 'Other'],
  },
  details: {
    type: String,
    required: [true, 'Details are required'],
    trim: true,
  },
  status: {
    type: String,
    enum: ['New', 'Read', 'Replied', 'Archived'],
    default: 'New',
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  },
}, {
  timestamps: true,
});

contactSchema.index({ status: 1 });
contactSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Contact', contactSchema);
