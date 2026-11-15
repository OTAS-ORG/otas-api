const hasAny = (user, allowed) => Array.isArray(user?.roles) && user.roles.some((role) => allowed.includes(role));
const isPriceRole = (user) => hasAny(user, ['ceo_bd', 'finance_admin', 'sales']);
const seesFinance = (user) => hasAny(user, ['ceo_bd', 'finance_admin']);
const seesCost = (user) => hasAny(user, ['ceo_bd']);
const seesMarketingMoney = (user) => hasAny(user, ['ceo_bd', 'finance_admin', 'marketing_head']);
module.exports = { isPriceRole, seesFinance, seesCost, seesMarketingMoney };
