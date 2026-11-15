const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const StepLog = require('../models/StepLog');
const { ROLES } = require('../permissions/roles');
const { AppError } = require('../utils/appError');

const assertCeo = (actor) => {
  if (!actor?._id || !Array.isArray(actor.roles) || !actor.roles.includes('ceo_bd') || actor.active !== true) {
    throw new AppError('NOT_AUTHORIZED', 403);
  }
};
const validateRoles = (roles) => {
  if (!Array.isArray(roles) || !roles.length || roles.some((r) => !ROLES.includes(r)) || new Set(roles).size !== roles.length) {
    throw new AppError('ROLE_INVALID', 400);
  }
};
const safeUser = (user) => ({ _id: user._id, username: user.username, fullName: user.fullName || '',
  roles: Array.from(user.roles || []), active: user.active, mustChangePassword: user.mustChangePassword });
const temporaryPassword = () => crypto.randomBytes(24).toString('base64url');

const runUserCommand = async ({ actor, operation, userId, username, fullName, roles }) => {
  assertCeo(actor);
  if (!['createUser', 'setUserRoles', 'disableUser', 'enableUser', 'resetPasswordTemp'].includes(operation)) {
    throw new AppError('INVALID_INPUT', 400);
  }
  if (operation === 'createUser') {
    if (typeof username !== 'string' || !username.trim() || username !== username.trim() || username.length > 100 ||
        ['admin', 'system'].includes(username.toLowerCase()) ||
        (fullName !== undefined && (typeof fullName !== 'string' || fullName.length > 200))) throw new AppError('INVALID_INPUT', 400);
    validateRoles(roles);
  } else if (!mongoose.isObjectIdOrHexString(userId)) throw new AppError('INVALID_INPUT', 400);
  if (operation === 'setUserRoles') validateRoles(roles);
  // Avoid locking the current CEO out or removing their last CEO role accidentally.
  if (userId && userId.toString() === actor._id.toString() &&
      (operation === 'disableUser' || (operation === 'setUserRoles' && !roles.includes('ceo_bd')))) {
    throw new AppError('USER_CONFLICT', 409);
  }
  const password = ['createUser', 'resetPasswordTemp'].includes(operation) ? temporaryPassword() : null;
  const session = await User.db.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      let user;
      if (operation === 'createUser') {
        const created = await User.create([{ username, fullName: fullName || '', password, roles,
          active: true, tokenVersion: 0, mustChangePassword: true }], { session });
        user = created[0];
      } else {
        user = await User.findById(userId).session(session);
        if (!user) throw new AppError('USER_NOT_FOUND', 404);
        if (operation === 'setUserRoles') user.roles = roles;
        if (operation === 'disableUser') user.active = false;
        if (operation === 'enableUser') user.active = true;
        if (operation === 'resetPasswordTemp') { user.password = password; user.mustChangePassword = true; }
        if (!Number.isSafeInteger(user.tokenVersion) || user.tokenVersion < 0 || !Number.isSafeInteger(user.tokenVersion + 1)) {
          throw new AppError('USER_CONFLICT', 409);
        }
        user.tokenVersion += 1;
        await user.save({ session });
      }
      await StepLog.create([{ entityType: 'user', entityId: user._id, stepKey: operation,
        actorKind: 'human', actor: actor._id }], { session });
      result = { user: safeUser(user), ...(password ? { temporaryPassword: password } : {}) };
    });
  } finally {
    await session.endSession();
  }
  return result;
};

module.exports = { runUserCommand, assertCeo, validateRoles, safeUser };
