const Salary = require('../models/Salary');
const sendResponse = require('../utils/response');

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
    const salary = await Salary.findById(req.params.id).populate('createdBy', 'username');
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
    const populated = await Salary.findById(salary._id).populate('createdBy', 'username');

    sendResponse(res, 201, true, 'Salary created successfully', populated);
  } catch (error) {
    console.error('Error in createSalary:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.updateSalary = async (req, res) => {
  try {
    const salary = await Salary.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).populate('createdBy', 'username');

    if (!salary) {
      return sendResponse(res, 404, false, 'Salary not found');
    }

    sendResponse(res, 200, true, 'Salary updated successfully', salary);
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
