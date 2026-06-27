const Expense = require('../models/Expense');
const ExpenseCategory = require('../models/ExpenseCategory');
const AuditLog = require('../models/AuditLog');
const sendResponse = require('../utils/response');

const createAudit = async (expenseId, action, details, user) => {
  await AuditLog.create({
    clientId: expenseId,
    action,
    details,
    user: user || 'Core Team'
  });
};

// --- Expenses CRUD ---

exports.getExpenses = async (req, res) => {
  try {
    const { dateFrom, dateTo, category, search, page = 1, limit = 50 } = req.query;
    const query = {};

    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) query.date.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [expenses, total] = await Promise.all([
      Expense.find(query)
        .populate('clientId', 'companyName')
        .populate('createdBy', 'username')
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Expense.countDocuments(query)
    ]);

    sendResponse(res, 200, true, 'Expenses retrieved successfully', { expenses, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    console.error('Error in getExpenses:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.getExpenseById = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('clientId', 'companyName contactPerson')
      .populate('createdBy', 'username');

    if (!expense) return sendResponse(res, 404, false, 'Expense not found');

    sendResponse(res, 200, true, 'Expense retrieved successfully', expense);
  } catch (error) {
    console.error('Error in getExpenseById:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.createExpense = async (req, res) => {
  try {
    const { description, amount, currency, exchangeRate, category, paymentMethod, clientId, notes, date } = req.body;

    // Auto-save category if new
    if (category) {
      const exists = await ExpenseCategory.findOne({ name: category });
      if (!exists) {
        await ExpenseCategory.create({ name: category, createdBy: req.user?._id });
      }
    }

    const expense = await Expense.create({
      date: date || new Date(),
      description,
      amount,
      currency: currency || 'MMK',
      exchangeRate: exchangeRate || 0,
      category,
      paymentMethod,
      clientId: clientId || undefined,
      notes,
      createdBy: req.user?._id
    });

    const populated = await expense.populate([
      { path: 'clientId', select: 'companyName' },
      { path: 'createdBy', select: 'username' }
    ]);

    await createAudit(expense._id, 'EXPENSE_CREATED', { description, amount, category }, req.user?.username);

    sendResponse(res, 201, true, 'Expense created successfully', populated);
  } catch (error) {
    console.error('Error in createExpense:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.updateExpense = async (req, res) => {
  try {
    const { description, amount, currency, exchangeRate, category, paymentMethod, clientId, notes, date } = req.body;

    // Auto-save category if new
    if (category) {
      const exists = await ExpenseCategory.findOne({ name: category });
      if (!exists) {
        await ExpenseCategory.create({ name: category, createdBy: req.user?._id });
      }
    }

    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      { date, description, amount, currency, exchangeRate, category, paymentMethod, clientId: clientId || undefined, notes },
      { new: true, runValidators: true }
    )
      .populate('clientId', 'companyName')
      .populate('createdBy', 'username');

    if (!expense) return sendResponse(res, 404, false, 'Expense not found');

    await createAudit(expense._id, 'EXPENSE_UPDATED', { description, amount, category }, req.user?.username);

    sendResponse(res, 200, true, 'Expense updated successfully', expense);
  } catch (error) {
    console.error('Error in updateExpense:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return sendResponse(res, 404, false, 'Expense not found');

    await AuditLog.deleteMany({ clientId: req.params.id });

    sendResponse(res, 200, true, 'Expense deleted successfully');
  } catch (error) {
    console.error('Error in deleteExpense:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// --- Categories ---

exports.getCategories = async (req, res) => {
  try {
    const categories = await ExpenseCategory.find().sort({ name: 1 });
    sendResponse(res, 200, true, 'Categories retrieved successfully', categories);
  } catch (error) {
    console.error('Error in getCategories:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const exists = await ExpenseCategory.findOne({ name });
    if (exists) return sendResponse(res, 400, false, 'Category already exists');

    const category = await ExpenseCategory.create({ name, createdBy: req.user?._id });
    sendResponse(res, 201, true, 'Category created successfully', category);
  } catch (error) {
    console.error('Error in createCategory:', error);
    sendResponse(res, 500, false, error.message);
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await ExpenseCategory.findByIdAndDelete(req.params.id);
    if (!category) return sendResponse(res, 404, false, 'Category not found');

    sendResponse(res, 200, true, 'Category deleted successfully');
  } catch (error) {
    console.error('Error in deleteCategory:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// --- Summary / Reports ---

exports.getExpenseSummary = async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999);

    const mmkConvert = {
      $cond: [
        { $eq: ['$currency', 'USD'] },
        { $multiply: ['$amount', { $ifNull: ['$exchangeRate', 0] }] },
        '$amount'
      ]
    };

    // Monthly totals — all converted to MMK
    const monthlyData = await Expense.aggregate([
      { $match: { date: { $gte: startDate, $lte: endDate } } },
      { $addFields: { amountMMK: mmkConvert } },
      {
        $group: {
          _id: { month: { $month: '$date' } },
          total: { $sum: '$amountMMK' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.month': 1 } }
    ]);

    // Category breakdown — all converted to MMK
    const categoryBreakdown = await Expense.aggregate([
      { $match: { date: { $gte: startDate, $lte: endDate } } },
      { $addFields: { amountMMK: mmkConvert } },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amountMMK' },
          count: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ]);

    // Grand total — all converted to MMK
    const totalAgg = await Expense.aggregate([
      { $match: { date: { $gte: startDate, $lte: endDate } } },
      { $addFields: { amountMMK: mmkConvert } },
      {
        $group: {
          _id: null,
          total: { $sum: '$amountMMK' },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalExpensesMMK = totalAgg[0]?.total || 0;

    sendResponse(res, 200, true, 'Expense summary retrieved successfully', {
      year: targetYear,
      totalExpensesMMK,
      monthlyData,
      categoryBreakdown
    });
  } catch (error) {
    console.error('Error in getExpenseSummary:', error);
    sendResponse(res, 500, false, error.message);
  }
};
