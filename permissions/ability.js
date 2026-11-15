const { AbilityBuilder, createMongoAbility } = require('@casl/ability');
const { ROLES } = require('./roles');
const { isPriceRole, seesFinance, seesCost, seesMarketingMoney } = require('./moneyClasses');

const defineAbilityFor = (user) => {
  const { can, build } = new AbilityBuilder(createMongoAbility);
  const roles = Array.isArray(user?.roles) ? user.roles.filter((role) => ROLES.includes(role)) : [];
  if (!roles.length || !user?._id) return build();
  const id = user._id.toString();
  can('read', 'StaffDirectory');
  can('update', 'OwnProfile', { userId: id });
  can('read', 'PublicSettings');
  if (isPriceRole(user)) can('read', ['Invoice', 'InvoiceClient']);
  if (seesFinance(user)) {
    can(['create', 'update', 'delete'], 'Invoice');
    can('read', 'FinanceSettings');
    // Temporary guard for existing finance endpoints; granular finance policies
    // and record-level checks are introduced with the relevant modules.
    can('access', 'LegacyFinance');
  }
  if (seesCost(user)) can('read', 'CostSettings');
  if (seesMarketingMoney(user)) can('read', 'MarketingMoneySettings');
  // ProjectNonMoney is an explicitly money-free projection, not a raw Project.
  if (roles.some((role) => ['ceo_bd', 'finance_admin', 'pd_head', 'developer', 'uiux', 'dqa_head', 'dqa'].includes(role))) {
    can('read', 'ProjectNonMoney');
  }
  if (roles.some((role) => ['pd_head', 'dqa_head'].includes(role))) {
    can('update', 'Project', { owner: id });
  }
  if (roles.includes('ceo_bd')) {
    can('access', 'PasswordVault');
    can(['create', 'update'], 'StaffDirectory');
    can(['create', 'update'], 'UserAccount');
    can('update', ['PublicSettings', 'FinanceSettings', 'CostSettings', 'MarketingMoneySettings']);
    can(['read', 'update'], 'Project');
  }
  return build();
};

module.exports = { defineAbilityFor };
