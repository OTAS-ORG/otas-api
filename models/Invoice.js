const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  quantity: { type: Number, required: true, default: 1 },
  unitPrice: { type: Number, required: true },
  amount: { type: Number, required: true }
});

const paymentDetailSchema = new mongoose.Schema({
  channel: { type: String },
  amount: { type: Number },
  senderName: { type: String },
  receiverName: { type: String },
  dateTime: { type: Date },
  note: { type: String }
});

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },

  // Denormalized client info
  companyName: { type: String, required: true },
  contactPerson: { type: String },
  contactInfo: { type: String },
  projectId: { type: String },

  // Service items
  items: [invoiceItemSchema],

  // Financials
  amount: { type: Number, required: true },
  platformFeeRate: { type: Number, default: 0 },
  platformFee: { type: Number, default: 0 },
  additionalCharges: [{
    name: { type: String },
    amount: { type: Number }
  }],

  // Dates
  date: { type: Date, default: Date.now },
  dueDate: { type: Date },
  serviceStartDate: { type: Date },
  serviceEndDate: { type: Date },

  // Status & workflow
  status: {
    type: String,
    enum: ['Draft', 'Sent', 'Paid', 'Cancelled'],
    default: 'Draft'
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Received'],
    default: 'Pending'
  },
  payoutStatus: {
    type: String,
    enum: ['Pending', 'Paid'],
    default: 'Pending'
  },
  paymentMethod: { type: String, default: 'KBZPay (Kpay)' },
  paymentDetails: paymentDetailSchema,
  payoutDetails: paymentDetailSchema,

  isLocked: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

invoiceSchema.virtual('grandTotal').get(function() {
  const additionalTotal = (this.additionalCharges || []).reduce((sum, c) => sum + (c.amount || 0), 0);
  return (this.amount || 0) + (this.platformFee || 0) + additionalTotal;
});

invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ clientId: 1 });
invoiceSchema.index({ status: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
