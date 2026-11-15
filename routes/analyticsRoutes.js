const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { protect } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');

router.use(protect);
router.use(authorize('access', 'LegacyFinance'));

router.get('/', analyticsController.getDashboard);

module.exports = router;
