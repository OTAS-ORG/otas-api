const mongoose = require('mongoose');

const onboardingTokenSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
  },
  serviceTypes: [{
    type: String,
  }],
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
  },
  formData: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  isCompleted: {
    type: Boolean,
    default: false,
  },
  completedAt: {
    type: Date,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

onboardingTokenSchema.index({ clientId: 1 });
onboardingTokenSchema.index({ token: 1 });
onboardingTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OnboardingToken', onboardingTokenSchema);
