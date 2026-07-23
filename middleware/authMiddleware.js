const jwt = require('jsonwebtoken');
const User = require('../models/User');

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
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');

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

module.exports = { protect, financeOnly };
