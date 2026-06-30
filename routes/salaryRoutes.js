const express = require('express');
const router = express.Router();
const salaryController = require('../controllers/salaryController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/summary', salaryController.getSalarySummary);
router.get('/', salaryController.getSalaries);
router.get('/:id', salaryController.getSalaryById);
router.post('/', salaryController.createSalary);
router.put('/:id', salaryController.updateSalary);
router.delete('/:id', salaryController.deleteSalary);

module.exports = router;
