const express = require('express');
const router = express.Router();
const salaryController = require('../controllers/salaryController');
const { protect } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');
const ownPayslips = require('../repositories/ownPayslipRepository');
const sendResponse = require('../utils/response');

router.use(protect);
router.get('/me', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const result = await ownPayslips.listOwnPayslips(req.user, req.query.page);
    return sendResponse(res, 200, true, 'Your payslips retrieved', result);
  } catch (error) { return next(error); }
});
router.use(authorize('access', 'LegacyFinance'));

router.get('/summary', salaryController.getSalarySummary);
router.get('/unreimbursed-expenses/:userId', salaryController.getUnreimbursedExpenses);
router.get('/', salaryController.getSalaries);
router.get('/:id', salaryController.getSalaryById);
router.post('/', salaryController.createSalary);
router.put('/:id', salaryController.updateSalary);
router.delete('/:id', salaryController.deleteSalary);

module.exports = router;
