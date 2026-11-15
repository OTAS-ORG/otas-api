const MESSAGES = Object.freeze({
  NOT_AUTHENTICATED: 'Authentication is required',
  NOT_AUTHORIZED: 'You are not authorized',
  USER_DISABLED: 'Account is disabled',
  TOKEN_REVOKED: 'Session has been revoked',
  PASSWORD_CHANGE_REQUIRED: 'Change your password before continuing',
  INVALID_CREDENTIALS: 'Invalid username or password',
  ROLE_INVALID: 'Invalid role',
  MONEY_CLASS_DENIED: 'Access to this information is denied',
  INVALID_JSON: 'Invalid JSON request',
  INVALID_INPUT: 'Invalid request',
  USER_NOT_FOUND: 'User not found',
  USER_CONFLICT: 'User account could not be updated',
  INTERNAL_ERROR: 'An internal error occurred',
});

class AppError extends Error {
  constructor(code, httpStatus, details) {
    if (!Object.hasOwn(MESSAGES, code) || code === 'INTERNAL_ERROR') {
      throw new TypeError('Unknown application error code');
    }
    if (!Number.isInteger(httpStatus) || httpStatus < 400 || httpStatus > 599) {
      throw new TypeError('Invalid application error status');
    }
    super(MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = httpStatus;
    // Details are internal only and are never returned to the caller.
    this.details = details;
  }
}

module.exports = { AppError, MESSAGES };
