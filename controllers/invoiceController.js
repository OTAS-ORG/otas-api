const Invoice = require('../models/Invoice');
const Client = require('../models/Client');
const AuditLog = require('../models/AuditLog');
const sendResponse = require('../utils/response');

const generateInvoiceNumber = async () => {
  const count = await Invoice.countDocuments();
  const padded = String(count + 1).padStart(4, '0');
  return `INV-${padded}`;
};

const createAudit = async (invoiceId, action, details, user) => {
  await AuditLog.create({
    clientId: invoiceId,
    action,
    details,
    user: user || 'Core Team'
  });
};

exports.getInvoices = async (req, res) => {
  try {
    const { search, status } = req.query;
    let query = {};

    if (status) query.status = status;

    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } }
      ];
    }

    const invoices = await Invoice.find(query).sort({ createdAt: -1 });
    sendResponse(res, 200, true, 'Invoices retrieved successfully', invoices);
  } catch (error) {
    console.error('Error in getInvoices:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('clientId', 'companyName contactPerson');
    if (!invoice) return sendResponse(res, 404, false, 'Invoice not found');

    sendResponse(res, 200, true, 'Invoice retrieved successfully', invoice);
  } catch (error) {
    console.error('Error in getInvoiceById:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.createInvoice = async (req, res) => {
  try {
    const invoiceNumber = await generateInvoiceNumber();
    const invoiceData = { ...req.body, invoiceNumber };
    if (req.user) invoiceData.createdBy = req.user._id;

    // Auto-calculate platform fee
    if (invoiceData.amount && invoiceData.platformFeeRate) {
      invoiceData.platformFee = Math.round(invoiceData.amount * (invoiceData.platformFeeRate / 100));
    }

    // Auto-calculate item amounts
    if (invoiceData.items) {
      invoiceData.items = invoiceData.items.map(item => ({
        ...item,
        amount: item.quantity * item.unitPrice
      }));
    }

    const invoice = new Invoice(invoiceData);
    const savedInvoice = await invoice.save();

    await createAudit(savedInvoice._id, 'CREATE', { invoiceNumber: savedInvoice.invoiceNumber }, req.user?.username);

    sendResponse(res, 201, true, 'Invoice created successfully', savedInvoice);
  } catch (error) {
    console.error('Error in createInvoice:', error);
    sendResponse(res, 400, false, error.message);
  }
};

exports.updateInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return sendResponse(res, 404, false, 'Invoice not found');

    if (invoice.isLocked) return sendResponse(res, 403, false, 'Invoice is locked and cannot be edited');

    const updateData = { ...req.body };

    // Recalculate platform fee
    if (updateData.amount !== undefined && updateData.platformFeeRate !== undefined) {
      updateData.platformFee = Math.round(updateData.amount * (updateData.platformFeeRate / 100));
    } else if (updateData.amount !== undefined && invoice.platformFeeRate) {
      updateData.platformFee = Math.round(updateData.amount * (invoice.platformFeeRate / 100));
    }

    // Recalculate item amounts
    if (updateData.items) {
      updateData.items = updateData.items.map(item => ({
        ...item,
        amount: item.quantity * item.unitPrice
      }));
    }

    Object.assign(invoice, updateData);
    const updatedInvoice = await invoice.save();

    await createAudit(updatedInvoice._id, 'UPDATE', { changes: updateData }, req.user?.username);

    sendResponse(res, 200, true, 'Invoice updated successfully', updatedInvoice);
  } catch (error) {
    console.error('Error in updateInvoice:', error);
    sendResponse(res, 400, false, error.message);
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return sendResponse(res, 404, false, 'Invoice not found');

    const { status, paymentStatus, payoutStatus } = req.body;
    const changes = {};

    if (status) { invoice.status = status; changes.status = status; }
    if (paymentStatus) { invoice.paymentStatus = paymentStatus; changes.paymentStatus = paymentStatus; }
    if (payoutStatus) { invoice.payoutStatus = payoutStatus; changes.payoutStatus = payoutStatus; }

    const updatedInvoice = await invoice.save();
    await createAudit(updatedInvoice._id, 'STATUS_CHANGE', changes, req.user?.username);

    sendResponse(res, 200, true, 'Invoice status updated', updatedInvoice);
  } catch (error) {
    console.error('Error in updateStatus:', error);
    sendResponse(res, 400, false, error.message);
  }
};

exports.confirmPayment = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return sendResponse(res, 404, false, 'Invoice not found');

    const { channel, amount, senderName, dateTime, note } = req.body;

    invoice.paymentStatus = 'Received';
    invoice.status = 'Paid';
    invoice.paymentDetails = { channel, amount, senderName, dateTime, note };

    const updatedInvoice = await invoice.save();
    await createAudit(updatedInvoice._id, 'PAYMENT_RECEIVED', { channel, amount, senderName }, req.user?.username);

    sendResponse(res, 200, true, 'Payment confirmed successfully', updatedInvoice);
  } catch (error) {
    console.error('Error in confirmPayment:', error);
    sendResponse(res, 400, false, error.message);
  }
};

exports.confirmPayout = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return sendResponse(res, 404, false, 'Invoice not found');

    const { channel, amount, receiverName, dateTime, note } = req.body;

    invoice.payoutStatus = 'Paid';
    invoice.payoutDetails = { channel, amount, receiverName, dateTime, note };

    const updatedInvoice = await invoice.save();
    await createAudit(updatedInvoice._id, 'PAYOUT_COMPLETED', { channel, amount, receiverName }, req.user?.username);

    sendResponse(res, 200, true, 'Payout confirmed successfully', updatedInvoice);
  } catch (error) {
    console.error('Error in confirmPayout:', error);
    sendResponse(res, 400, false, error.message);
  }
};

exports.lockInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return sendResponse(res, 404, false, 'Invoice not found');

    invoice.isLocked = true;
    invoice.status = 'Paid';
    const updatedInvoice = await invoice.save();

    await createAudit(updatedInvoice._id, 'LOCKED', { message: 'Invoice locked' }, req.user?.username);

    sendResponse(res, 200, true, 'Invoice locked successfully', updatedInvoice);
  } catch (error) {
    console.error('Error in lockInvoice:', error);
    sendResponse(res, 400, false, error.message);
  }
};

exports.unlockInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return sendResponse(res, 404, false, 'Invoice not found');

    invoice.isLocked = false;
    const updatedInvoice = await invoice.save();

    await createAudit(updatedInvoice._id, 'UNLOCKED', { message: 'Invoice unlocked' }, req.user?.username);

    sendResponse(res, 200, true, 'Invoice unlocked successfully', updatedInvoice);
  } catch (error) {
    console.error('Error in unlockInvoice:', error);
    sendResponse(res, 400, false, error.message);
  }
};
