const mongoose = require('mongoose');

const ticketCommentSchema = new mongoose.Schema({
  ticket_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true }
}, { timestamps: true });

ticketCommentSchema.index({ ticket_id: 1, createdAt: 1 });

module.exports = mongoose.model('TicketComment', ticketCommentSchema);
