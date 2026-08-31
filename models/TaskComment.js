const mongoose = require('mongoose');

const taskCommentSchema = new mongoose.Schema({
  task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, default: '', trim: true },
  images: [{ type: String }],
  reactions: [
    {
      emoji: { type: String, required: true },
      users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    },
  ],
}, { timestamps: true });

taskCommentSchema.index({ task_id: 1, createdAt: 1 });

module.exports = mongoose.model('TaskComment', taskCommentSchema);
