const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret } = require('../utils/jwtSecret');
const { safeEqual } = require('../utils/safeEqual');
const mongoose = require('mongoose');
const sendResponse = require('../utils/response');
const { isTokenVersion } = require('../utils/authSession');

const authenticate = async (req, res, next, allowPasswordChange) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
  if (!match) return sendResponse(res, 401, false, 'A Bearer token is required', null, 'NOT_AUTHORIZED');
  let secret;
  try {
    secret = getJwtSecret();
  } catch {
    return sendResponse(res, 503, false, 'Authentication is unavailable', null, 'AUTH_UNAVAILABLE');
  }
  let decoded;
  try {
    decoded = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
  } catch {
    return sendResponse(res, 401, false, 'Invalid or expired token', null, 'NOT_AUTHORIZED');
  }
  if (!decoded || typeof decoded.id !== 'string' || !mongoose.isObjectIdOrHexString(decoded.id)) {
    return sendResponse(res, 401, false, 'Invalid token identity', null, 'NOT_AUTHORIZED');
  }
  if (!isTokenVersion(decoded.tokenVersion) || !Number.isFinite(decoded.exp)) {
    return sendResponse(res, 401, false, 'Session has been revoked; sign in again', null, 'TOKEN_REVOKED');
  }
  let user;
  try {
    user = await User.findById(decoded.id).select('-password -vaultPin').populate('departments', 'name');
  } catch (error) {
    console.error('Authentication lookup failed:', error.name);
    return sendResponse(res, 503, false, 'Authentication is unavailable', null, 'AUTH_UNAVAILABLE');
  }
  if (!user) return sendResponse(res, 401, false, 'Account is unavailable', null, 'NOT_AUTHORIZED');
  if (user.active !== true) return sendResponse(res, 401, false, 'Account is disabled', null, 'USER_DISABLED');
  if (!isTokenVersion(user.tokenVersion) || user.tokenVersion !== decoded.tokenVersion) {
    return sendResponse(res, 401, false, 'Session has been revoked', null, 'TOKEN_REVOKED');
  }
  if (user.mustChangePassword === true && !allowPasswordChange) {
    return sendResponse(res, 403, false, 'Change your password before continuing', null, 'PASSWORD_CHANGE_REQUIRED');
  }
  req.user = user;
  req.authToken = match[1];
  return next();
};

const protect = (req, res, next) => authenticate(req, res, next, false);
// Mount only on the exact POST change-password route, never on a user-supplied URL check.
const protectPasswordChange = (req, res, next) => authenticate(req, res, next, true);

const financeOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const isMasterAdmin = req.user.role === 'Admin' && (!req.user.departments || req.user.departments.length === 0);
  const isFinance = req.user.departments && req.user.departments.some(d => d.name === 'Finance');

  if (isMasterAdmin || isFinance) {
    return next();
  }

  return res.status(403).json({ success: false, message: 'Forbidden: Access restricted to Finance department only' });
};

// Mirrors the frontend ProjectRoute: Sales-department users (non-Admin) cannot access projects
const blockSales = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const roles = Array.isArray(req.user.roles) ? req.user.roles : [];
  const isSales = !roles.includes('ceo_bd') && (
    roles.includes('sales') ||
    (req.user.departments && req.user.departments.some(d => d.name === 'Sales'))
  );

  if (isSales) {
    return res.status(403).json({ success: false, message: 'Forbidden: Projects are not available to the Sales department' });
  }

  return next();
};

// For cron endpoints: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically.
// Without CRON_SECRET, only non-production environments are allowed through.
const cronAuth = (req, res, next) => {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    if (process.env.NODE_ENV !== 'production') return next();
    return res.status(503).json({ success: false, message: 'CRON_SECRET is not configured' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!safeEqual(token, cronSecret)) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  return next();
};

module.exports = { protect, protectPasswordChange, financeOnly, blockSales, cronAuth };
