const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  clientId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Client', 
    required: true 
  },
  formType: { 
    type: String, 
    required: true,
    enum: ['business_email', 'onboarding', 'website_requirements'] // Extendable for future forms
  },
  submittedBy: {
    name: { type: String, required: true },
    position: { type: String, required: true }
  },
  formData: { 
    type: mongoose.Schema.Types.Mixed, 
    required: true 
  },
  status: {
    type: String,
    enum: ['Pending', 'Verified', 'Rejected'],
    default: 'Pending'
  }
}, { timestamps: true });

// Index for faster lookups
submissionSchema.index({ clientId: 1, formType: 1 });

module.exports = mongoose.model('Submission', submissionSchema);
