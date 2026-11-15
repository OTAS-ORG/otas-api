const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('./jwtSecret');

const isTokenVersion = (value) => Number.isSafeInteger(value) && value >= 0;

const generateToken = (user) => {
  if (!isTokenVersion(user.tokenVersion)) throw new Error('Invalid account session version');
  return jwt.sign({ id: user._id.toString(), tokenVersion: user.tokenVersion }, getJwtSecret(), {
    algorithm: 'HS256', expiresIn: '7d',
  });
};

// Explicit allowlist: never spread a User document into an authentication response.
const serializeSession = (user, token) => ({
  _id: user._id,
  username: user.username,
  fullName: user.fullName || '',
  roles: Array.from(user.roles || []),
  mustChangePassword: user.mustChangePassword === true,
  token,
});

module.exports = { generateToken, serializeSession, isTokenVersion };
