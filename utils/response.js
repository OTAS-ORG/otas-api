/**
 * Standard API Response Helper
 * @param {Object} res - Express response object
 * @param {Number} statusCode - HTTP status code
 * @param {Boolean} success - Success flag
 * @param {String} message - Response message
 * @param {Any} data - Response data (optional)
 */
const sendResponse = (res, statusCode, success, message, data = null) => {
  const response = {
    success,
    message,
    statusCode
  };

  if (data !== null) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

module.exports = sendResponse;
