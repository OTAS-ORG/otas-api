const { AppError, MESSAGES } = require('../utils/appError');
const sendResponse = require('../utils/response');

const errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof AppError) {
    return sendResponse(res, error.statusCode, false, MESSAGES[error.code], null, error.code);
  }
  // Express body-parser identifies malformed JSON with this stable error type.
  if (error?.type === 'entity.parse.failed' && error.status === 400) {
    return sendResponse(res, 400, false, MESSAGES.INVALID_JSON, null, 'INVALID_JSON');
  }
  console.error('Unhandled request error:', error?.name || 'Error');
  return sendResponse(res, 500, false, MESSAGES.INTERNAL_ERROR, null, 'INTERNAL_ERROR');
};

module.exports = errorHandler;
