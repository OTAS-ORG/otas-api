const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/summary', expenseController.getExpenseSummary);
router.get('/departments', expenseController.getDepartments);
router.get('/categories', expenseController.getCategories);
router.post('/categories', expenseController.createCategory);
router.delete('/categories/:id', expenseController.deleteCategory);

router.get('/', expenseController.getExpenses);
router.get('/:id', expenseController.getExpenseById);
router.post('/', expenseController.createExpense);
router.put('/:id', expenseController.updateExpense);
router.delete('/:id', expenseController.deleteExpense);

module.exports = router;
