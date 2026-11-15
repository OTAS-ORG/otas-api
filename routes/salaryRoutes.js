const express = require('express');
const router = express.Router();
const salaryController = require('../controllers/salaryController');
const { protect } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');

router.use(protect);
router.use(authorize('access', 'LegacyFinance'));

router.get('/summary', salaryController.getSalarySummary);
router.get('/unreimbursed-expenses/:userId', salaryController.getUnreimbursedExpenses);
router.get('/', salaryController.getSalaries);
router.get('/:id', salaryController.getSalaryById);
router.post('/', salaryController.createSalary);
router.put('/:id', salaryController.updateSalary);
router.delete('/:id', salaryController.deleteSalary);

module.exports = router;
