const mongoose = require('mongoose');

const stepLogSchema = new mongoose.Schema({
  entityType: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  stepKey: { type: String, required: true },
  actorKind: { type: String, enum: ['human', 'system'], required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

stepLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
module.exports = mongoose.model('StepLog', stepLogSchema);
