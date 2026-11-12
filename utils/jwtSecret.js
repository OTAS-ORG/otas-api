// Single source of the JWT signing secret.
// Production must set JWT_SECRET; the fallback exists for local development only.
const getJwtSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is not configured');
  }
  return 'fallback-for-dev-only';
};

module.exports = { getJwtSecret };
