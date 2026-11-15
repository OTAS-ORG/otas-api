const User = require('../models/User');
const { runUserCommand, safeUser } = require('../commands/users');
const sendResponse = require('../utils/response');

exports.getDirectory = async (req, res, next) => {
  try {
    const users = await User.find().select('_id username fullName roles active mustChangePassword').sort({ username: 1 });
    return sendResponse(res, 200, true, 'Staff directory retrieved', users.map(safeUser));
  } catch (error) { return next(error); }
};

const perform = (operation) => async (req, res, next) => {
  try {
    const result = await runUserCommand({ actor: req.user, operation, userId: req.params.id,
      username: req.body?.username, fullName: req.body?.fullName, roles: req.body?.roles });
    return sendResponse(res, operation === 'createUser' ? 201 : 200, true, 'User updated', result);
  } catch (error) { return next(error); }
};

exports.createUser = perform('createUser');
exports.setRoles = perform('setUserRoles');
exports.disableUser = perform('disableUser');
exports.enableUser = perform('enableUser');
exports.resetPassword = perform('resetPasswordTemp');
