const sendResponse = require('../utils/response');
const expenses = require('../repositories/expenseRepository');

exports.getExpenses = async (req, res, next) => {
  try { sendResponse(res, 200, true, 'Expenses retrieved successfully', await expenses.getExpenses(req.user, req.query)); }
  catch (error) { return next(error); }
};
exports.getExpenseById = async (req, res, next) => {
  try {
    const expense = await expenses.getById(req.user, req.params.id);
    if (!expense) return sendResponse(res, 404, false, 'Expense not found');
    sendResponse(res, 200, true, 'Expense retrieved successfully', expense);
  } catch (error) { return next(error); }
};
exports.createExpense = async (req, res, next) => {
  try { sendResponse(res, 201, true, 'Expense created successfully', await expenses.create(req.user, req.body)); }
  catch (error) { if (['ValidationError', 'CastError'].includes(error.name)) return sendResponse(res, 400, false, 'Invalid expense data'); return next(error); }
};
exports.updateExpense = async (req, res, next) => {
  try {
    const result = await expenses.update(req.user, req.params.id, req.body);
    if (result.status === 'missing') return sendResponse(res, 404, false, 'Expense not found');
    if (result.status === 'linked') return sendResponse(res, 409, false, 'Expense is linked to payroll');
    sendResponse(res, 200, true, 'Expense updated successfully', result.expense);
  } catch (error) { if (['ValidationError', 'CastError'].includes(error.name)) return sendResponse(res, 400, false, 'Invalid expense data'); return next(error); }
};
exports.deleteExpense = async (req, res, next) => {
  try {
    const result = await expenses.remove(req.user, req.params.id);
    if (result.status === 'missing') return sendResponse(res, 404, false, 'Expense not found');
    if (result.status === 'linked') return sendResponse(res, 409, false, 'Expense is linked to payroll');
    sendResponse(res, 200, true, 'Expense deleted successfully');
  } catch (error) { return next(error); }
};

exports.getCategories = async (req, res, next) => {
  try { sendResponse(res, 200, true, 'Categories retrieved successfully', await expenses.getCategories(req.user)); }
  catch (error) { return next(error); }
};
exports.createCategory = async (req, res, next) => {
  try {
    const category = await expenses.createCategory(req.user, req.body?.name);
    if (!category) return sendResponse(res, 400, false, 'Category already exists');
    sendResponse(res, 201, true, 'Category created successfully', category);
  } catch (error) { if (error.code === 11000) return sendResponse(res, 400, false, 'Category already exists'); return next(error); }
};
exports.deleteCategory = async (req, res, next) => {
  try {
    const category = await expenses.deleteCategory(req.user, req.params.id);
    if (!category) return sendResponse(res, 404, false, 'Category not found');
    sendResponse(res, 200, true, 'Category deleted successfully');
  } catch (error) { return next(error); }
};
exports.getExpenseSummary = async (req, res, next) => {
  try { sendResponse(res, 200, true, 'Expense summary retrieved successfully', await expenses.summary(req.user, req.query.year)); }
  catch (error) { return next(error); }
};
exports.getDepartments = async (req, res, next) => {
  try { sendResponse(res, 200, true, 'Departments retrieved successfully', await expenses.getDepartments(req.user)); }
  catch (error) { return next(error); }
};
