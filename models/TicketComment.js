const mongoose = require('mongoose');

const ticketCommentSchema = new mongoose.Schema({
  ticket_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, default: '' },
  images: [{ type: String }],
  reactions: [
    {
      emoji: { type: String, required: true },
      users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    },
  ],
  is_internal: { type: Boolean, default: false }
}, { timestamps: true });

ticketCommentSchema.index({ ticket_id: 1, createdAt: 1 });

module.exports = mongoose.model('TicketComment', ticketCommentSchema);
