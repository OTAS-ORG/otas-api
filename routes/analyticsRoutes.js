const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { protect, financeOnly } = require('../middleware/authMiddleware');

router.use(protect);
router.use(financeOnly);

router.get('/', analyticsController.getDashboard);

module.exports = router;
