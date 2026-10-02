const Leave = require('../models/Leave');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const sendResponse = require('../utils/response');

// GET /api/leaves
exports.getLeaves = async (req, res) => {
  try {
    const { userId, month, year, status, category } = req.query;
    const filter = {};

    if (userId) filter.userId = userId;
    if (status) filter.status = status;
    if (category) filter.category = category;

    if (month && year) {
      const m = parseInt(month, 10);
      const y = parseInt(year, 10);
      const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
      const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
      filter.date = { $gte: start, $lte: end };
    } else if (year) {
      const y = parseInt(year, 10);
      const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
      const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
      filter.date = { $gte: start, $lte: end };
    }

    const leaves = await Leave.find(filter)
      .populate('userId', 'username fullName employeeId position department baseSalary fullDayDeduction halfDayDeduction')
      .sort({ date: -1 });

    sendResponse(res, 200, true, 'Leaves fetched successfully', leaves);
  } catch (error) {
    console.error('Error in getLeaves:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// GET /api/leaves/summary
// Returns count of full days, half days, total deduction amount, and approved leave records
exports.getLeaveSummary = async (req, res) => {
  try {
    const { userId, month, year } = req.query;

    if (!userId || !month || !year) {
      return sendResponse(res, 400, false, 'userId, month, and year are required');
    }

    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    const approvedLeaves = await Leave.find({
      userId,
      status: 'Approved',
      date: { $gte: start, $lte: end }
    }).sort({ date: 1 });

    let fullDaysCount = 0;
    let halfDaysCount = 0;
    let totalDeduction = 0;

    for (const l of approvedLeaves) {
      if (l.leaveType === 'Half') {
        halfDaysCount += 1;
      } else {
        fullDaysCount += 1;
      }
      totalDeduction += Number(l.deductionAmount) || 0;
    }

    sendResponse(res, 200, true, 'Leave summary calculated', {
      userId,
      month: m,
      year: y,
      fullDaysCount,
      halfDaysCount,
      totalLeavesCount: fullDaysCount + (halfDaysCount * 0.5),
      totalDeduction,
      leaves: approvedLeaves
    });
  } catch (error) {
    console.error('Error in getLeaveSummary:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// POST /api/leaves
exports.createLeave = async (req, res) => {
  try {
    const {
      userId,
      employeeName,
      date,
      leaveType = 'Full',
      halfDaySession,
      category = 'Unpaid',
      status = 'Approved',
      deductionAmount,
      reason = ''
    } = req.body;

    if (!userId || !date) {
      return sendResponse(res, 400, false, 'User and date are required');
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendResponse(res, 404, false, 'User not found');
    }

    let finalDeduction = Number(deductionAmount);
    // If deduction is not explicitly passed or is NaN, calculate from user policy
    if (isNaN(finalDeduction)) {
      if (category === 'Unpaid') {
        if (leaveType === 'Half') {
          finalDeduction = user.halfDayDeduction || (user.fullDayDeduction ? Math.round(user.fullDayDeduction / 2) : 0);
          if (!finalDeduction && user.baseSalary) {
            finalDeduction = Math.round((user.baseSalary / 30) / 2);
          }
        } else {
          finalDeduction = user.fullDayDeduction || 0;
          if (!finalDeduction && user.baseSalary) {
            finalDeduction = Math.round(user.baseSalary / 30);
          }
        }
      } else {
        finalDeduction = 0;
      }
    }

    const leave = await Leave.create({
      userId,
      employeeName: employeeName || user.fullName || user.username,
      date: new Date(date),
      leaveType,
      halfDaySession: leaveType === 'Half' ? (halfDaySession || 'Morning') : null,
      category,
      status,
      deductionAmount: finalDeduction,
      reason,
      recordedBy: req.user?.username || 'System'
    });

    try {
      await AuditLog.create({
        action: 'CREATE',
        entityType: 'Leave',
        entityId: leave._id,
        user: req.user?.username || 'System',
        details: `Recorded leave for ${leave.employeeName} on ${new Date(date).toISOString().slice(0, 10)} (${leaveType} day, -${finalDeduction} MMK)`
      });
    } catch (auditErr) {
      console.warn('Audit log creation failed:', auditErr.message);
    }

    const populated = await Leave.findById(leave._id)
      .populate('userId', 'username employeeId position department');

    sendResponse(res, 201, true, 'Leave recorded successfully', populated);
  } catch (error) {
    console.error('Error in createLeave:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// PUT /api/leaves/:id
exports.updateLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return sendResponse(res, 404, false, 'Leave record not found');
    }

    const {
      date,
      leaveType,
      halfDaySession,
      category,
      status,
      deductionAmount,
      reason
    } = req.body;

    if (date) leave.date = new Date(date);
    if (leaveType) {
      leave.leaveType = leaveType;
      leave.halfDaySession = leaveType === 'Half' ? (halfDaySession || leave.halfDaySession || 'Morning') : null;
    }
    if (halfDaySession !== undefined) leave.halfDaySession = halfDaySession;
    if (category) leave.category = category;
    if (status) leave.status = status;
    if (deductionAmount !== undefined) leave.deductionAmount = Number(deductionAmount) || 0;
    if (reason !== undefined) leave.reason = reason;

    await leave.save();

    const updated = await Leave.findById(leave._id)
      .populate('userId', 'username employeeId position department');

    sendResponse(res, 200, true, 'Leave updated successfully', updated);
  } catch (error) {
    console.error('Error in updateLeave:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// DELETE /api/leaves/:id
exports.deleteLeave = async (req, res) => {
  try {
    const leave = await Leave.findByIdAndDelete(req.params.id);
    if (!leave) {
      return sendResponse(res, 404, false, 'Leave record not found');
    }

    try {
      await AuditLog.create({
        action: 'DELETE',
        entityType: 'Leave',
        entityId: req.params.id,
        user: req.user?.username || 'System',
        details: `Deleted leave record for ${leave.employeeName} on ${new Date(leave.date).toISOString().slice(0, 10)}`
      });
    } catch (auditErr) {
      console.warn('Audit log creation failed:', auditErr.message);
    }

    sendResponse(res, 200, true, 'Leave deleted successfully');
  } catch (error) {
    console.error('Error in deleteLeave:', error);
    sendResponse(res, 500, false, error.message);
  }
};
