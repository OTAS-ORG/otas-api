const sendResponse = require('../utils/response');
const invoiceReads = require('../repositories/invoiceReads');
const invoiceWrites = require('../repositories/invoiceWrites');
const { AppError } = require('../utils/appError');

exports.getInvoices = async (req, res, next) => {
  try {
    const { search, status, type } = req.query;
    let query = {};

    if (status) query.status = status;
    if (type) query.type = type;

    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } }
      ];
    }

    const invoices = await invoiceReads.listInvoices(req.user, query);
    sendResponse(res, 200, true, 'Invoices retrieved successfully', invoices);
  } catch (error) {
    return next(error);
  }
};

exports.getInvoiceById = async (req, res, next) => {
  try {
    const invoice = await invoiceReads.getInvoice(req.user, req.params.id);
    if (!invoice) return sendResponse(res, 404, false, 'Invoice not found');

    sendResponse(res, 200, true, 'Invoice retrieved successfully', invoice);
  } catch (error) {
    return next(error);
  }
};

exports.createInvoice = async (req, res, next) => {
  try {
    const savedInvoice = await invoiceWrites.createInvoice(req.user, req.body);
    sendResponse(res, 201, true, 'Invoice created successfully', savedInvoice);
  } catch (error) {
    if (error instanceof AppError) return next(error);
    if (error.name === 'ValidationError' || error.name === 'CastError') return sendResponse(res, 400, false, 'Invalid invoice data');
    return next(error);
  }
};

const handleMutation = (operation, successMessage) => async (req, res, next) => {
  try {
    const result = await invoiceWrites.mutateInvoice(req.user, req.params.id, operation, req.body);
    if (result.status === 'missing') return sendResponse(res, 404, false, 'Invoice not found');
    if (result.status === 'locked') return sendResponse(res, 403, false, 'Invoice is locked and cannot be changed');
    return sendResponse(res, 200, true, successMessage, operation === 'delete' ? undefined : result.invoice);
  } catch (error) {
    if (error instanceof AppError) return next(error);
    if (error.name === 'ValidationError' || error.name === 'CastError') return sendResponse(res, 400, false, 'Invalid invoice data');
    return next(error);
  }
};

exports.updateInvoice = handleMutation('edit', 'Invoice updated successfully');
exports.updateStatus = handleMutation('status', 'Invoice status updated');
exports.confirmPayment = handleMutation('payment', 'Payment confirmed successfully');
exports.confirmPayout = handleMutation('payout', 'Payout confirmed successfully');
exports.lockInvoice = handleMutation('lock', 'Invoice locked successfully');
exports.unlockInvoice = handleMutation('unlock', 'Invoice unlocked successfully');
exports.deleteInvoice = handleMutation('delete', 'Invoice deleted successfully');
