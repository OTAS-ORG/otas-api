const User = require('../models/User');
const jwt = require('jsonwebtoken');
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
