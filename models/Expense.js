const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, enum: ['MMK', 'USD'], default: 'MMK' },
  exchangeRate: { type: Number, default: 0 },
  category: { type: String, required: true },
  department: { type: String },
  paymentMethod: { type: String },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  notes: { type: String },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isReimbursedViaPayroll: { type: Boolean, default: false },
  salaryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salary' },
  reimbursedAt: { type: Date }
}, { timestamps: true });

expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ createdBy: 1 });
expenseSchema.index({ isReimbursedViaPayroll: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
