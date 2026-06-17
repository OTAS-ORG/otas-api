const mongoose = require('mongoose');

const formFieldSchema = new mongoose.Schema({
  name: { type: String, required: true },
  label: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: ['text', 'number', 'textarea', 'file', 'checkbox', 'dropdown', 'repeater'],
  },
  required: { type: Boolean, default: false },
  placeholder: { type: String },
  options: [{ type: String }],
  accept: { type: String },
  maxSize: { type: Number, default: 20 },
  conditions: {
    dependsOn: { type: String },
    value: { type: String },
  },
  fields: [mongoose.Schema.Types.Mixed],
}, { _id: false });

const formSectionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  fields: [formFieldSchema],
}, { _id: false });

const onboardingFormConfigSchema = new mongoose.Schema({
  serviceType: {
    type: String,
    required: true,
    unique: true,
  },
  serviceName: { type: String, required: true },
  sections: [formSectionSchema],
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('OnboardingFormConfig', onboardingFormConfigSchema);
