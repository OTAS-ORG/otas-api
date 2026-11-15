const mongoose = require('mongoose');
const URI_NAMES = Object.freeze({
  none: 'MONGODB_URI_BASE', selling: 'MONGODB_URI_SELLING', finance: 'MONGODB_URI_FINANCE',
  cost: 'MONGODB_URI_COST', marketing: 'MONGODB_URI_MARKETING',
});
const pools = new Map();

const getConnection = async (moneyClass) => {
  const envName = URI_NAMES[moneyClass];
  if (!envName) throw new Error('Unknown money class');
  const uri = process.env[envName];
  if (!uri) throw new Error(`Database connection is not configured: ${envName}`);
  if (/[?&]appName=/i.test(uri)) throw new Error('Database URI must not contain appName');
  if (!pools.has(moneyClass)) {
    // Indexes are managed by migrations, not by restricted application identities.
    const connection = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000, autoIndex: false });
    const promise = connection.asPromise().catch(async (error) => {
      pools.delete(moneyClass);
      await connection.close().catch(() => {});
      throw error;
    });
    pools.set(moneyClass, promise);
  }
  return pools.get(moneyClass);
};

module.exports = { getConnection, URI_NAMES };
