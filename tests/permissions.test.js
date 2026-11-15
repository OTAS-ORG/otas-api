const { subject } = require('@casl/ability');
const { ROLES } = require('../permissions/roles');
const { defineAbilityFor } = require('../permissions/ability');
const money = require('../permissions/moneyClasses');
const authorize = require('../middleware/authorize');

test.each(ROLES)('platform matrix for %s', (role) => {
  const user = { _id: 'user-1', roles: [role] };
  const ability = defineAbilityFor(user);
  const ceo = role === 'ceo_bd';
  expect(ability.can('read', 'StaffDirectory')).toBe(true);
  expect(ability.can('update', 'StaffDirectory')).toBe(ceo);
  expect(ability.can('create', 'UserAccount')).toBe(ceo);
  expect(ability.can('read', 'PublicSettings')).toBe(true);
  expect(ability.can('update', 'PublicSettings')).toBe(ceo);
  expect(ability.can('read', 'FinanceSettings')).toBe(['ceo_bd', 'finance_admin'].includes(role));
  expect(ability.can('access', 'LegacyFinance')).toBe(['ceo_bd', 'finance_admin'].includes(role));
  expect(ability.can('read', 'CostSettings')).toBe(ceo);
  expect(ability.can('read', 'MarketingMoneySettings')).toBe(['ceo_bd', 'finance_admin', 'marketing_head'].includes(role));
  expect(ability.can('update', subject('OwnProfile', { userId: 'user-1' }))).toBe(true);
  expect(ability.can('update', subject('OwnProfile', { userId: 'user-2' }))).toBe(false);
  expect(money.isPriceRole(user)).toBe(['ceo_bd', 'finance_admin', 'sales'].includes(role));
});

test('combines role permissions and fails closed on unknown roles', () => {
  const user = { _id: 'u', roles: ['sales', 'marketing_head'] };
  expect(money.isPriceRole(user)).toBe(true);
  expect(defineAbilityFor(user).can('read', 'MarketingMoneySettings')).toBe(true);
  expect(defineAbilityFor({ _id: 'u', roles: ['Admin'] }).can('read', 'StaffDirectory')).toBe(false);
  expect(defineAbilityFor(null).can('read', 'StaffDirectory')).toBe(false);
});

test('middleware denies missing permissions', () => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  authorize('create', 'UserAccount')({ user: { _id: 'u', roles: ['developer'] } }, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json.mock.calls[0][0].code).toBe('NOT_AUTHORIZED');
  expect(next).not.toHaveBeenCalled();
});

test('middleware requires a concrete record for own-profile permissions', () => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  const req = { user: { _id: 'user-1', roles: ['developer'] } };
  authorize('update', 'OwnProfile')(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
  authorize('update', () => subject('OwnProfile', { userId: 'user-1' }))(req, res, next);
  expect(next).toHaveBeenCalledTimes(1);
  authorize('update', () => subject('OwnProfile', { userId: 'user-2' }))(req, res, next);
  expect(next).toHaveBeenCalledTimes(1);
});

test.each(['pd_head', 'dqa_head'])('%s can update owned projects only', (role) => {
  const ability = defineAbilityFor({ _id: 'user-1', roles: [role] });
  expect(ability.can('update', subject('Project', { owner: 'user-1' }))).toBe(true);
  expect(ability.can('update', subject('Project', { owner: 'user-2' }))).toBe(false);
  expect(ability.can('update', subject('Project', { owner: null }))).toBe(false);
  expect(ability.can('read', 'ProjectNonMoney')).toBe(true);
  expect(ability.can('read', 'Project')).toBe(false);
});

test('CEO project permissions do not grant automatic unrelated privileges', () => {
  const ability = defineAbilityFor({ _id: 'ceo', roles: ['ceo_bd'] });
  expect(ability.can('update', subject('Project', { owner: 'another' }))).toBe(true);
  expect(ability.can('delete', 'Project')).toBe(false);
});
