const mongoose = require('mongoose');

const expenseDepartmentSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('ExpenseDepartment', expenseDepartmentSchema);
