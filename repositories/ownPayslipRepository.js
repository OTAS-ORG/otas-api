const mongoose = require('mongoose');
const { ROLES } = require('../permissions/roles');
const { AppError } = require('../utils/appError');
const connections = require('../db/connections');

// A MongoDB identity cannot restrict individual employee rows. The fixed owner
// predicate, paid status and allowlist must stay together for every self read.
const projection = Object.freeze({ _id: 1, employeeName: 1, employeeId: 1, position: 1,
  department: 1, month: 1, year: 1, baseSalary: 1, allowances: 1, deductions: 1,
  totalAllowances: 1, totalDeductions: 1, netPay: 1, currency: 1, status: 1,
  paidDate: 1, paymentChannel: 1, reimbursedExpensesTotal: 1 });

const listOwnPayslips = async (user, pageInput) => {
  if (!user?._id || !mongoose.isObjectIdOrHexString(user._id) ||
      !Array.isArray(user.roles) || !user.roles.some(role => ROLES.includes(role))) {
    throw new AppError('NOT_AUTHORIZED', 403);
  }
  const page = Number(pageInput || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new AppError('INVALID_INPUT', 400);
  const connection = await connections.getConnection('finance');
  const filter = { userId: new mongoose.Types.ObjectId(user._id.toString()), status: 'Paid' };
  const limit = 20;
  const rows = await connection.db.collection('salaries').find(filter, { projection })
    .sort({ year: -1, month: -1, _id: -1 }).skip((page - 1) * limit).limit(limit + 1).toArray();
  return { payslips: rows.slice(0, limit), page, hasMore: rows.length > limit };
};

module.exports = { listOwnPayslips };
