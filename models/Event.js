const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: ['meeting', 'call', 'task', 'reminder', 'event'],
      default: 'meeting',
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    allDay: {
      type: Boolean,
      default: false,
    },
    location: {
      type: String,
      default: '',
    },
    meetingUrl: {
      type: String,
      default: '',
    },
    color: {
      type: String,
      default: 'blue', // blue, emerald, indigo, amber, rose, purple
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    attendees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled'],
      default: 'scheduled',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

eventSchema.index({ startDate: 1, endDate: 1 });
eventSchema.index({ organizer: 1 });
eventSchema.index({ attendees: 1 });
eventSchema.index({ clientId: 1 });

module.exports = mongoose.model('Event', eventSchema);
