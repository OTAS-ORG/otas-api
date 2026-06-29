const mongoose = require('mongoose');

const ticketHistorySchema = new mongoose.Schema({
  ticket_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action_performed: { type: String, required: true }
}, { timestamps: true });

ticketHistorySchema.index({ ticket_id: 1, createdAt: 1 });

module.exports = mongoose.model('TicketHistory', ticketHistorySchema);
