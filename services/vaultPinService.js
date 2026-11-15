const bcrypt = require('bcryptjs');
const User = require('../models/User');

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

// Reserve each attempt atomically before bcrypt, so parallel requests and
// separate server instances share the same limit. No plaintext PIN is stored.
const verifyPin = async (userId, pin) => {
  if (typeof pin !== 'string' || pin.length < 4 || Buffer.byteLength(pin, 'utf8') > 72) return 'required';
  const now = new Date();
  const user = await User.findOneAndUpdate({
    _id: userId, active: { $ne: false }, vaultPin: { $exists: true, $ne: null },
    $or: [{ vaultPinLockedUntil: null }, { vaultPinLockedUntil: { $lte: now } }],
  }, [
    { $set: { vaultPinAttempts: { $cond: [
      { $and: [{ $ne: [{ $ifNull: ['$vaultPinLockedUntil', null] }, null] }, { $lte: ['$vaultPinLockedUntil', now] }] },
      1, { $add: [{ $ifNull: ['$vaultPinAttempts', 0] }, 1] },
    ] } } },
    { $set: { vaultPinLockedUntil: { $cond: [
      { $gte: ['$vaultPinAttempts', MAX_ATTEMPTS] }, new Date(now.getTime() + LOCK_MS), null,
    ] } } },
  ], { returnDocument: 'after', updatePipeline: true }).select('vaultPin vaultPinAttempts vaultPinLockedUntil');
  if (!user) return 'locked';
  const valid = await bcrypt.compare(pin, user.vaultPin);
  if (valid) {
    // Reject if the PIN or attempt counter changed concurrently.
    const result = await User.updateOne({ _id: userId, vaultPin: user.vaultPin,
      vaultPinAttempts: user.vaultPinAttempts, active: { $ne: false } },
    { $set: { vaultPinAttempts: 0, vaultPinLockedUntil: null } });
    return result.matchedCount === 1 ? 'valid' : 'retry';
  }
  return user.vaultPinAttempts >= MAX_ATTEMPTS ? 'locked' : 'invalid';
};

const sendPinFailure = (res, result) => {
  const sendResponse = require('../utils/response');
  if (result === 'required') return sendResponse(res, 400, false, 'Vault PIN is required', null, 'VAULT_PIN_REQUIRED');
  if (result === 'locked') return sendResponse(res, 429, false, 'Too many PIN attempts. Try again later.', null, 'VAULT_PIN_LOCKED');
  if (result === 'retry') return sendResponse(res, 409, false, 'Please retry PIN verification', null, 'VAULT_PIN_RETRY');
  return sendResponse(res, 403, false, 'Incorrect vault PIN', null, 'VAULT_PIN_INVALID');
};
module.exports = { verifyPin, sendPinFailure, MAX_ATTEMPTS, LOCK_MS };
