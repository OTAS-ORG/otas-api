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

    const user = await User.findOne({ username });

    if (user && (await user.matchPassword(password))) {
      const userData = {
        _id: user._id,
        username: user.username,
        role: user.role,
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
