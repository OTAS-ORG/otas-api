const mongoose = require('mongoose');

const conversationLogSchema = new mongoose.Schema({
  text: { type: String, required: true },
  date: { type: Date, default: Date.now }
});

const clientSchema = new mongoose.Schema({
  // New Fields for Client Form
  name: { type: String },
  email: { type: String },
  businessName: { type: String },

  // Pre-Sale Fields
  companyName: { type: String, required: true },

  industry: { type: String },
  backgroundNote: { type: String },
  contactPerson: { type: String, required: true },
  contactInfo: { type: String, required: true }, // Phone/Email
  inquiryDate: { type: Date, required: true },
  sourceChannel: { type: String, required: true },
  currentProblems: { type: String },
  desiredOutcome: { type: String },
  servicesExplained: { type: String },
  conversationLogs: [conversationLogSchema],
  status: { 
    type: String, 
    required: true, 
    enum: [
      'Inquiry', 
      'Service Explained', 
      'Meeting Made', 
      'Sent Proposal', 
      'Sent Contract', 
      'Signed', 
      'Ghosted', 
      'Follow-up needed',
      'In-Development',
      'Delivered'
    ],
    default: 'Inquiry'
  },
  isPostSale: { type: Boolean, default: false },
  nextActionDate: { 
    type: Date, 
    required: function() { return this.status === 'Follow-up needed'; } 
  },
  contactPersonPosition: { type: String },

  // Post-Sale Fields
  projectId: { type: String },
  projectStartDate: { type: Date },
  projectDeliveryDate: { type: Date },
  deliverablesSummary: { type: String },

  // Purchased Services
  purchasedServices: [{
    type: { type: String },
    name: { type: String },
    status: { type: String, enum: ['pending', 'active', 'completed'], default: 'pending' }
  }],

  // Multi-department logging (stored in conversationLogs for now, or separate if needed)
  // For v1.0, we'll use conversationLogs for all department notes as well.

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for submissions
clientSchema.virtual('submissions', {
  ref: 'Submission',
  localField: '_id',
  foreignField: 'clientId'
});

// Auto-migration logic: Triggered when status changes to 'Signed'
clientSchema.pre('save', async function() {
  if (this.isModified('status') && this.status === 'Signed') {
    this.isPostSale = true;
  }
});

module.exports = mongoose.model('Client', clientSchema);
