const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User is required'] 
  },
  employeeName: { 
    type: String, 
    required: [true, 'Employee name is required'] 
  },
  date: { 
    type: Date, 
    required: [true, 'Leave date is required'] 
  },
  leaveType: { 
    type: String, 
    enum: ['Full', 'Half'], 
    default: 'Full' 
  },
  halfDaySession: { 
    type: String, 
    enum: ['Morning', 'Afternoon', null], 
    default: null 
  },
  category: { 
    type: String, 
    enum: ['Unpaid', 'Casual', 'Medical', 'Other'], 
    default: 'Unpaid' 
  },
  status: { 
    type: String, 
    enum: ['Approved', 'Pending', 'Rejected'], 
    default: 'Approved' 
  },
  deductionAmount: { 
    type: Number, 
    default: 0 
  },
  reason: { 
    type: String, 
    default: '' 
  },
  recordedBy: { 
    type: String 
  }
}, { timestamps: true });

leaveSchema.index({ userId: 1, date: 1 });

module.exports = mongoose.model('Leave', leaveSchema);
