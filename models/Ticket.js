const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Pending', 'Resolved'],
    default: 'Open'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Medium'
  },
  department_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

ticketSchema.index({ department_id: 1, status: 1 });
ticketSchema.index({ created_by: 1 });

module.exports = mongoose.model('Ticket', ticketSchema);
