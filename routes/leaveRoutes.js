const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leaveController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/summary', leaveController.getLeaveSummary);
router.get('/', leaveController.getLeaves);
router.post('/', leaveController.createLeave);
router.put('/:id', leaveController.updateLeave);
router.delete('/:id', leaveController.deleteLeave);

module.exports = router;
