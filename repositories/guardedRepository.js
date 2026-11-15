const { accessibleBy } = require('@casl/mongoose');
const { AppError } = require('../utils/appError');
const { isPriceRole, seesFinance, seesCost, seesMarketingMoney } = require('../permissions/moneyClasses');
const { ROLES } = require('../permissions/roles');
const { COLLECTIONS } = require('./collectionRegistry');
const connections = require('../db/connections');

const classAllowed = (user, moneyClass) => ({
  none: () => Array.isArray(user?.roles) && user.roles.some((role) => ROLES.includes(role)),
  selling: () => isPriceRole(user), finance: () => seesFinance(user),
  cost: () => seesCost(user), marketing: () => seesMarketingMoney(user),
}[moneyClass]?.() === true);

const authorizeCollection = ({ user, ability, collection, action }) => {
  const config = Object.hasOwn(COLLECTIONS, collection) ? COLLECTIONS[collection] : null;
  if (!config || !classAllowed(user, config.moneyClass)) throw new AppError('MONEY_CLASS_DENIED', 403);
  if (!ability || !ability.can(action, config.subject)) throw new AppError('NOT_AUTHORIZED', 403);
  return config;
};

const findMany = async ({ user, ability, collection, filter = {}, sort }) => {
  const config = authorizeCollection({ user, ability, collection, action: 'read' });
  const accessible = accessibleBy(ability, 'read').ofType(config.subject);
  const connection = await connections.getConnection(config.moneyClass);
  const cursor = connection.db.collection(collection).find({ $and: [accessible, filter] },
    config.projection ? { projection: config.projection } : {});
  if (sort) cursor.sort(sort);
  return cursor.toArray();
};

module.exports = { findMany, classAllowed, authorizeCollection };
