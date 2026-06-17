const OnboardingToken = require('../models/OnboardingToken');
const sendResponse = require('../utils/response');

const onboardingAuth = async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      return sendResponse(res, 400, false, 'Token is required');
    }

    const onboardingToken = await OnboardingToken.findOne({ token });
    if (!onboardingToken) {
      return sendResponse(res, 404, false, 'Invalid or expired link');
    }

    if (onboardingToken.isCompleted) {
      return sendResponse(res, 400, false, 'This form has already been submitted');
    }

    if (new Date() > onboardingToken.expiresAt) {
      return sendResponse(res, 410, false, 'This link has expired');
    }

    req.onboardingToken = onboardingToken;
    next();
  } catch (error) {
    console.error('Error in onboardingAuth:', error);
    sendResponse(res, 500, false, error.message);
  }
};

module.exports = onboardingAuth;
