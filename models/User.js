const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../permissions/roles');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  // Retain legacy role until auth/controllers and existing users are migrated.
  roles: {
    type: [{ type: String, enum: ROLES }],
    default: [],
    validate: {
      validator: (roles) => Array.isArray(roles) && new Set(roles).size === roles.length,
      message: 'Roles must be a non-null array without duplicates',
    },
  },
  active: { type: Boolean, required: true, default: true },
  tokenVersion: {
    type: Number, required: true, default: 0, min: 0,
    validate: { validator: Number.isSafeInteger, message: 'Token version must be a safe integer' },
  },
  mustChangePassword: { type: Boolean, required: true, default: false },
  role: { 
    type: String, 
    enum: ['Admin', 'User'], 
    default: 'User' 
  },
  department_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
  fullName: { type: String, default: '', trim: true },
  employeeId: { type: String, default: '' },
  position: { type: String, default: '' },
  dateOfJoining: { type: Date },
  department: { type: String, default: '' },
  baseSalary: { type: Number, default: 0 },
  fullDayDeduction: { type: Number, default: 0 },
  halfDayDeduction: { type: Number, default: 0 },
  vaultPin: { type: String },
  vaultPinAttempts: { type: Number, default: 0, min: 0 },
  vaultPinLockedUntil: { type: Date, default: null },
  telegramChatId: { type: String, sparse: true, unique: true }
}, { timestamps: true });

userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
