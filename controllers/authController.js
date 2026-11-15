const User = require('../models/User');
const bcrypt = require('bcryptjs');
const sendResponse = require('../utils/response');
const { generateToken, serializeSession, isTokenVersion } = require('../utils/authSession');
const { verifyPin, sendPinFailure } = require('../services/vaultPinService');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
      return sendResponse(res, 400, false, 'Username and password are required', null, 'INVALID_CREDENTIALS');
    }
    if (username.toLowerCase() === 'system') {
      return sendResponse(res, 401, false, 'Invalid username or password', null, 'INVALID_CREDENTIALS');
    }

    const user = await User.findOne({ username })
      .select('_id username fullName roles active tokenVersion mustChangePassword password');

    if (user && (await user.matchPassword(password))) {
      if (user.active !== true) {
        return sendResponse(res, 401, false, 'Account is disabled', null, 'USER_DISABLED');
      }
      return sendResponse(res, 200, true, 'Login successful', serializeSession(user, generateToken(user)));
    } else {
      return sendResponse(res, 401, false, 'Invalid username or password', null, 'INVALID_CREDENTIALS');
    }
  } catch (error) {
    console.error('Error in login:', error.name);
    return sendResponse(res, 500, false, 'Login is unavailable', null, 'AUTH_UNAVAILABLE');
  }
};

exports.me = async (req, res) => {
  try {
    return sendResponse(res, 200, true, 'Current user retrieved', serializeSession(req.user, req.authToken));
  } catch (error) {
    console.error('Error in me:', error.name);
    return sendResponse(res, 500, false, 'Current user is unavailable', null, 'AUTH_UNAVAILABLE');
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !currentPassword ||
        typeof newPassword !== 'string' || !newPassword.trim() || Buffer.byteLength(newPassword, 'utf8') > 72) {
      return sendResponse(res, 400, false, 'Current password and a new password of at most 72 UTF-8 bytes are required', null, 'INVALID_PASSWORD');
    }
    const user = await User.findById(req.user._id)
      .select('_id username fullName roles active tokenVersion mustChangePassword password');
    if (!user || user.active !== true) {
      return sendResponse(res, 401, false, 'Account is disabled or unavailable', null, 'USER_DISABLED');
    }
    if (!isTokenVersion(user.tokenVersion) || user.tokenVersion !== req.user.tokenVersion) {
      return sendResponse(res, 401, false, 'Session has been revoked', null, 'TOKEN_REVOKED');
    }
    if (!(await user.matchPassword(currentPassword))) {
      return sendResponse(res, 400, false, 'Current password is incorrect', null, 'INVALID_CURRENT_PASSWORD');
    }
    if (await user.matchPassword(newPassword)) {
      return sendResponse(res, 400, false, 'New password must differ from the current password', null, 'PASSWORD_UNCHANGED');
    }
    if (!isTokenVersion(user.tokenVersion + 1)) {
      return sendResponse(res, 409, false, 'Account session version cannot be advanced', null, 'TOKEN_REVOKED');
    }
    // Query updates do not run the User pre-save password hook: hash explicitly once.
    const password = await bcrypt.hash(newPassword, 10);
    const versionMatch = user.tokenVersion === 0
      ? { $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] }
      : { tokenVersion: user.tokenVersion };
    const updated = await User.findOneAndUpdate({
      _id: user._id, password: user.password,
      $and: [versionMatch, { $or: [{ active: true }, { active: { $exists: false } }] }],
    }, {
      $set: { password, tokenVersion: user.tokenVersion + 1, mustChangePassword: false },
    }, { new: true, runValidators: true })
      .select('_id username fullName roles active tokenVersion mustChangePassword');
    if (!updated) {
      return sendResponse(res, 401, false, 'Account changed; sign in again', null, 'TOKEN_REVOKED');
    }
    return sendResponse(res, 200, true, 'Password changed', serializeSession(updated, generateToken(updated)));
  } catch (error) {
    console.error('Error in changePassword:', error.name);
    return sendResponse(res, 500, false, 'Password change is unavailable', null, 'AUTH_UNAVAILABLE');
  }
};

exports.setVaultPin = async (req, res) => {
  try {
    const { pin, currentPassword } = req.body || {};

    if (typeof pin !== 'string' || pin.length < 4 || Buffer.byteLength(pin, 'utf8') > 72 ||
        typeof currentPassword !== 'string' || !currentPassword) {
      return sendResponse(res, 400, false, 'PIN must be at least 4 characters');
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return sendResponse(res, 404, false, 'User not found');
    }

    if (!(await user.matchPassword(currentPassword))) {
      return sendResponse(res, 403, false, 'Current password is incorrect', null, 'INVALID_CURRENT_PASSWORD');
    }

    const salt = await bcrypt.genSalt(10);
    user.vaultPin = await bcrypt.hash(pin, salt);
    user.vaultPinAttempts = 0;
    user.vaultPinLockedUntil = null;
    await user.save();

    sendResponse(res, 200, true, 'Vault PIN set successfully');
  } catch (error) {
    console.error('Error in setVaultPin:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -vaultPin')
      .populate('departments', 'name')
      .sort({ username: 1 });
    sendResponse(res, 200, true, 'Users fetched successfully', users);
  } catch (error) {
    console.error('Error in getAllUsers:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.updateUserDepartments = async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return sendResponse(res, 403, false, 'Admin access required');
    }
    const { id } = req.params;
    const { department_ids } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return sendResponse(res, 404, false, 'User not found');
    }

    user.departments = department_ids || [];
    await user.save();

    const updated = await User.findById(id)
      .select('-password -vaultPin')
      .populate('departments', 'name');

    sendResponse(res, 200, true, 'User departments updated successfully', updated);
  } catch (error) {
    console.error('Error in updateUserDepartments:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.verifyVaultPin = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || !user.vaultPin) {
      return sendResponse(res, 400, false, 'No vault PIN set. Please set one first.');
    }

    const { pin } = req.body;

    if (!pin) {
      return sendResponse(res, 400, false, 'PIN is required');
    }

    const result = await verifyPin(req.user._id, pin);
    if (result !== 'valid') return sendPinFailure(res, result);

    sendResponse(res, 200, true, 'PIN verified');
  } catch (error) {
    console.error('Error in verifyVaultPin:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.updateUserTelegramChatId = async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return sendResponse(res, 403, false, 'Admin access required');
    }

    const { telegramChatId } = req.body;
    const update = {};

    if (telegramChatId && telegramChatId.trim()) {
      update.telegramChatId = telegramChatId.trim();
    } else {
      update.telegramChatId = undefined;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).select('-password -vaultPin').populate('departments', 'name');

    if (!user) {
      return sendResponse(res, 404, false, 'User not found');
    }

    sendResponse(res, 200, true, 'Telegram chat ID updated', user);
  } catch (error) {
    console.error('Error in updateUserTelegramChatId:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return sendResponse(res, 403, false, 'Admin access required');
    }

    const { role } = req.body;
    if (!role || !['Admin', 'User'].includes(role)) {
      return sendResponse(res, 400, false, 'Role must be Admin or User');
    }

    if (req.params.id === req.user._id.toString() && role !== 'Admin') {
      return sendResponse(res, 400, false, 'You cannot change your own role');
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    ).select('-password -vaultPin').populate('departments', 'name');

    if (!user) {
      return sendResponse(res, 404, false, 'User not found');
    }

    sendResponse(res, 200, true, 'User role updated', user);
  } catch (error) {
    console.error('Error in updateUserRole:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.createUser = async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return sendResponse(res, 403, false, 'Admin access required');
    }

    const { username, password, fullName, role, employeeId, position, dateOfJoining, department, baseSalary, fullDayDeduction, halfDayDeduction } = req.body;

    if (!username || !password) {
      return sendResponse(res, 400, false, 'Username and password are required');
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return sendResponse(res, 400, false, 'Username already exists');
    }

    const user = await User.create({
      username,
      password,
      fullName: fullName ? fullName.trim() : '',
      role: role || 'User',
      employeeId: employeeId || '',
      position: position || '',
      dateOfJoining: dateOfJoining || null,
      department: department || '',
      baseSalary: Number(baseSalary) || 0,
      fullDayDeduction: Number(fullDayDeduction) || 0,
      halfDayDeduction: Number(halfDayDeduction) || 0,
    });
    const userData = await User.findById(user._id).select('-password -vaultPin').populate('departments', 'name');

    sendResponse(res, 201, true, 'User created successfully', userData);
  } catch (error) {
    console.error('Error in createUser:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.updateEmployeeInfo = async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return sendResponse(res, 403, false, 'Admin access required');
    }

    const { id } = req.params;
    const { fullName, employeeId, position, dateOfJoining, department, baseSalary, fullDayDeduction, halfDayDeduction } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return sendResponse(res, 404, false, 'User not found');
    }

    if (fullName !== undefined) user.fullName = fullName ? fullName.trim() : '';
    if (employeeId !== undefined) user.employeeId = employeeId;
    if (position !== undefined) user.position = position;
    if (dateOfJoining !== undefined) user.dateOfJoining = dateOfJoining || null;
    if (department !== undefined) user.department = department;
    if (baseSalary !== undefined) user.baseSalary = Number(baseSalary) || 0;
    if (fullDayDeduction !== undefined) user.fullDayDeduction = Number(fullDayDeduction) || 0;
    if (halfDayDeduction !== undefined) user.halfDayDeduction = Number(halfDayDeduction) || 0;

    await user.save();

    const updated = await User.findById(id)
      .select('-password -vaultPin')
      .populate('departments', 'name');

    sendResponse(res, 200, true, 'Employee info updated successfully', updated);
  } catch (error) {
    console.error('Error in updateEmployeeInfo:', error);
    sendResponse(res, 500, false, error.message);
  }
};
