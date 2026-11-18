const express = require('express');
const router = express.Router();
const projectPlanController = require('../controllers/projectPlanController');
const { protect } = require('../middleware/authMiddleware');
const { requireCeo, noHardDelete } = require('../middleware/taskAccess');

router.use(protect);
// Plans and milestone descriptions are unclassified legacy text; temporarily
// restrict them to the CEO until money-free data is stored separately.
router.use(requireCeo);

// Dashboard widget summary
router.get('/widget/summary', projectPlanController.getDashboardWidgetSummary);

// Plan & Charter routes
router.get('/:projectId', projectPlanController.getProjectPlan);
router.put('/:projectId/charter', noHardDelete);

// Milestones CRUD routes
router.get('/:projectId/milestones', projectPlanController.getMilestones);
router.post('/:projectId/milestones', noHardDelete);
router.put('/:projectId/milestones/:id', noHardDelete);
router.delete('/:projectId/milestones/:id', noHardDelete);

module.exports = router;
