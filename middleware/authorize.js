const { defineAbilityFor } = require('../permissions/ability');
const sendResponse = require('../utils/response');

const authorize = (action, subject) => (req, res, next) => {
  if (!req.user) return sendResponse(res, 401, false, 'Authentication is required', null, 'NOT_AUTHENTICATED');
  const target = typeof subject === 'function' ? subject(req) : subject;
  const ability = defineAbilityFor(req.user);
  // CASL treats a type-only check as a potential match for conditional rules.
  // Require a concrete record before approving any scoped rule.
  const rule = ability.relevantRuleFor(action, target);
  if (!rule || (typeof target === 'string' && rule.conditions) || !ability.can(action, target)) {
    return sendResponse(res, 403, false, 'You are not authorized', null, 'NOT_AUTHORIZED');
  }
  return next();
};
module.exports = authorize;
