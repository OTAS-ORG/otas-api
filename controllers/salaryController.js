const payroll = require('../repositories/payrollRepository');
const sendResponse = require('../utils/response');
const handle = (action, message, missingMessage) => async (req, res, next) => {
  try {
    let result;
    if (action === 'list') result = await payroll.list(req.user, req.query);
    else if (action === 'get') result = await payroll.get(req.user, req.params.id);
    else if (action === 'summary') result = await payroll.summary(req.user, req.query.year);
    else if (action === 'unreimbursed') result = await payroll.unreimbursed(req.user, req.params.userId);
    else if (action === 'create') result = await payroll.create(req.user, req.body);
    else if (action === 'update') result = await payroll.update(req.user, req.params.id, req.body);
    else result = await payroll.remove(req.user, req.params.id);
    if (missingMessage && !result) return sendResponse(res, 404, false, missingMessage);
    return sendResponse(res, action === 'create' ? 201 : 200, true, message, action === 'remove' ? undefined : result);
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') return sendResponse(res, 400, false, 'Invalid salary data');
    return next(error);
  }
};
exports.getUnreimbursedExpenses = handle('unreimbursed', 'Unreimbursed expenses fetched successfully');
exports.getSalaries = handle('list', 'Salaries fetched successfully');
exports.getSalaryById = handle('get', 'Salary fetched successfully', 'Salary not found');
exports.createSalary = handle('create', 'Salary created successfully');
exports.updateSalary = handle('update', 'Salary updated successfully', 'Salary not found');
exports.deleteSalary = handle('remove', 'Salary deleted successfully', 'Salary not found');
exports.getSalarySummary = handle('summary', 'Salary summary fetched successfully');
