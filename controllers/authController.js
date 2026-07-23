const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sendResponse = require('../utils/response');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'secret123', {
    expiresIn: '30d',
  });
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username }).populate('departments', 'name');

    if (user && (await user.matchPassword(password))) {
      const userData = {
        _id: user._id,
        username: user.username,
        role: user.role,
        departments: user.departments ? user.departments.map(d => d.name) : [],
        token: generateToken(user._id),
      };
      sendResponse(res, 200, true, 'Login successful', userData);
    } else {
      sendResponse(res, 401, false, 'Invalid username or password');
    }
  } catch (error) {
    console.error('Error in login:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.setVaultPin = async (req, res) => {
  try {
    const { pin, currentPassword } = req.body;

    if (!pin || pin.length < 4) {
      return sendResponse(res, 400, false, 'PIN must be at least 4 characters');
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return sendResponse(res, 404, false, 'User not found');
    }

    if (user.vaultPin) {
      if (!(await user.matchPassword(currentPassword))) {
        return sendResponse(res, 401, false, 'Current password is incorrect');
      }
    }

    const salt = await bcrypt.genSalt(10);
    user.vaultPin = await bcrypt.hash(pin, salt);
    await user.save();

    sendResponse(res, 200, true, 'Vault PIN set successfully');
  } catch (error) {
    console.error('Error in setVaultPin:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return sendResponse(res, 403, false, 'Admin access required');
    }
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

    const isValid = await bcrypt.compare(pin, user.vaultPin);
    if (!isValid) {
      return sendResponse(res, 401, false, 'Incorrect vault PIN');
    }

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

    const { username, password, role } = req.body;

    if (!username || !password) {
      return sendResponse(res, 400, false, 'Username and password are required');
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return sendResponse(res, 400, false, 'Username already exists');
    }

    const user = await User.create({ username, password, role: role || 'User' });
    const userData = await User.findById(user._id).select('-password -vaultPin');

    sendResponse(res, 201, true, 'User created successfully', userData);
  } catch (error) {
    console.error('Error in createUser:', error);
    sendResponse(res, 500, false, error.message);
  }
};
