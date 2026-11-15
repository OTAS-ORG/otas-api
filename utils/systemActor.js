// System is an audit actor, not a User record and cannot authenticate.
module.exports = Object.freeze({ actorKind: 'system', actor: null });
