const crypto = require('crypto');

// Constant-time string comparison (avoids timing leaks when checking secrets)
const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

module.exports = { safeEqual };
