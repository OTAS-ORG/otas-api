const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret } = require('../utils/jwtSecret');
const { safeEqual } = require('../utils/safeEqual');

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, getJwtSecret());

      // Get user from the token and attach to request
      req.user = await User.findById(decoded.id).select('-password').populate('departments', 'name');

      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

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

  const isSales = req.user.role !== 'Admin' &&
    req.user.departments && req.user.departments.some(d => d.name === 'Sales');

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

module.exports = { protect, financeOnly, blockSales, cronAuth };
