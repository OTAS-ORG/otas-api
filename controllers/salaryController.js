const Salary = require('../models/Salary');
const Expense = require('../models/Expense');
const sendResponse = require('../utils/response');

exports.getUnreimbursedExpenses = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return sendResponse(res, 400, false, 'User ID is required');
    }

    const expenses = await Expense.find({
      createdBy: userId,
      isReimbursedViaPayroll: { $ne: true },
      status: { $in: ['Pending', 'Approved'] }
    }).sort({ date: -1 });

    sendResponse(res, 200, true, 'Unreimbursed expenses fetched successfully', expenses);
  } catch (error) {
    console.error('Error in getUnreimbursedExpenses:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getSalaries = async (req, res) => {
  try {
    const { search, status, department, month, year, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (department) filter.department = department;
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);
    if (search) {
      filter.$or = [
        { employeeName: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [salaries, total] = await Promise.all([
      Salary.find(filter)
        .populate('createdBy', 'username')
        .populate('userId', 'username fullName')
        .sort({ year: -1, month: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Salary.countDocuments(filter)
    ]);

    sendResponse(res, 200, true, 'Salaries fetched successfully', {
      salaries,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error in getSalaries:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getSalaryById = async (req, res) => {
  try {
    const salary = await Salary.findById(req.params.id)
      .populate('createdBy', 'username')
      .populate('userId', 'username fullName');
    if (!salary) {
      return sendResponse(res, 404, false, 'Salary not found');
    }
    sendResponse(res, 200, true, 'Salary fetched successfully', salary);
  } catch (error) {
    console.error('Error in getSalaryById:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.createSalary = async (req, res) => {
  try {
    const data = req.body;
    data.createdBy = req.user._id;

    const salary = await Salary.create(data);

    // If attachedExpenses are provided, mark them as reimbursed in Expense model
    if (salary.attachedExpenses && salary.attachedExpenses.length > 0) {
      const expenseIds = salary.attachedExpenses.map(e => e.expenseId).filter(Boolean);
      if (expenseIds.length > 0) {
        await Expense.updateMany(
          { _id: { $in: expenseIds } },
          {
            $set: {
              isReimbursedViaPayroll: true,
              salaryId: salary._id,
              status: 'Approved',
              reimbursedAt: new Date()
            }
          }
        );
      }
    }

    const populated = await Salary.findById(salary._id)
      .populate('createdBy', 'username')
      .populate('userId', 'username fullName');

    sendResponse(res, 201, true, 'Salary created successfully', populated);
  } catch (error) {
    console.error('Error in createSalary:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.updateSalary = async (req, res) => {
  try {
    const salary = await Salary.findById(req.params.id);
    if (!salary) {
      return sendResponse(res, 404, false, 'Salary not found');
    }

    const oldExpenseIds = (salary.attachedExpenses || []).map(e => (e.expenseId?._id || e.expenseId)?.toString()).filter(Boolean);
    const newAttachedExpenses = req.body.attachedExpenses || [];
    const newExpenseIds = newAttachedExpenses.map(e => (e.expenseId?._id || e.expenseId)?.toString()).filter(Boolean);

    // Unlink removed expenses
    const removedIds = oldExpenseIds.filter(id => !newExpenseIds.includes(id));
    if (removedIds.length > 0) {
      await Expense.updateMany(
        { _id: { $in: removedIds } },
        {
          $set: {
            isReimbursedViaPayroll: false,
            salaryId: null,
            reimbursedAt: null
          }
        }
      );
    }

    // Link newly added expenses
    const addedIds = newExpenseIds.filter(id => !oldExpenseIds.includes(id));
    if (addedIds.length > 0) {
      await Expense.updateMany(
        { _id: { $in: addedIds } },
        {
          $set: {
            isReimbursedViaPayroll: true,
            salaryId: salary._id,
            status: 'Approved',
            reimbursedAt: new Date()
          }
        }
      );
    }

    salary.set(req.body);
    salary.markModified('allowances');
    salary.markModified('deductions');
    salary.markModified('attachedExpenses');
    await salary.save();

    const populated = await Salary.findById(salary._id)
      .populate('createdBy', 'username')
      .populate('userId', 'username fullName');

    sendResponse(res, 200, true, 'Salary updated successfully', populated);
  } catch (error) {
    console.error('Error in updateSalary:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.deleteSalary = async (req, res) => {
  try {
    const salary = await Salary.findByIdAndDelete(req.params.id);
    if (!salary) {
      return sendResponse(res, 404, false, 'Salary not found');
    }

    // Unlink any reimbursed expenses
    await Expense.updateMany(
      { salaryId: req.params.id },
      {
        $set: {
          isReimbursedViaPayroll: false,
          salaryId: null,
          reimbursedAt: null
        }
      }
    );

    sendResponse(res, 200, true, 'Salary deleted successfully');
  } catch (error) {
    console.error('Error in deleteSalary:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getSalarySummary = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const summary = await Salary.aggregate([
      { $match: { year } },
      {
        $group: {
          _id: { month: '$month' },
          count: { $sum: 1 },
          totalBaseSalary: { $sum: '$baseSalary' },
          totalAllowances: { $sum: '$totalAllowances' },
          totalDeductions: { $sum: '$totalDeductions' },
          totalNetPay: { $sum: '$netPay' }
        }
      },
      { $sort: { '_id.month': 1 } }
    ]);

    const totals = await Salary.aggregate([
      { $match: { year } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalBaseSalary: { $sum: '$baseSalary' },
          totalAllowances: { $sum: '$totalAllowances' },
          totalDeductions: { $sum: '$totalDeductions' },
          totalNetPay: { $sum: '$netPay' }
        }
      }
    ]);

    sendResponse(res, 200, true, 'Salary summary fetched successfully', {
      year,
      monthlyData: summary,
      totals: totals[0] || { count: 0, totalBaseSalary: 0, totalAllowances: 0, totalDeductions: 0, totalNetPay: 0 }
    });
  } catch (error) {
    console.error('Error in getSalarySummary:', error);
    sendResponse(res, 500, false, error.message);
  }
};
