const mongoose = require('mongoose');

const salarySchema = new mongoose.Schema({
  employeeName: { type: String, required: true, trim: true },
  employeeId: { type: String, trim: true },
  position: { type: String, trim: true },
  dateOfJoining: { type: Date },
  department: { type: String, trim: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true },
  baseSalary: { type: Number, required: true },
  allowances: {
    phone: { type: Number, default: 0 },
    internet: { type: Number, default: 0 },
    travel: { type: Number, default: 0 },
    meal: { type: Number, default: 0 },
    commission: { type: Number, default: 0 }
  },
  deductions: {
    unpaidLeave: { type: Number, default: 0 },
    latePenalty: { type: Number, default: 0 },
    advanceSalary: { type: Number, default: 0 }
  },
  totalAllowances: { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  netPay: { type: Number, default: 0 },
  currency: { type: String, enum: ['MMK', 'USD'], default: 'MMK' },
  exchangeRate: { type: Number, default: 0 },
  status: { type: String, enum: ['Draft', 'Paid'], default: 'Draft' },
  paymentChannel: { type: String },
  paidDate: { type: Date },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

salarySchema.index({ month: 1, year: 1 });
salarySchema.index({ department: 1 });
salarySchema.index({ status: 1 });

salarySchema.pre('save', function () {
  const a = this.allowances || {};
  const d = this.deductions || {};
  this.totalAllowances = (a.phone || 0) + (a.internet || 0) + (a.travel || 0) + (a.meal || 0) + (a.commission || 0);
  this.totalDeductions = (d.unpaidLeave || 0) + (d.latePenalty || 0) + (d.advanceSalary || 0);
  this.netPay = (this.baseSalary || 0) + this.totalAllowances - this.totalDeductions;
});

module.exports = mongoose.model('Salary', salarySchema);
