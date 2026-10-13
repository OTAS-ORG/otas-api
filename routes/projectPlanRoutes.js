const express = require('express');
const router = express.Router();
const projectPlanController = require('../controllers/projectPlanController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// Dashboard widget summary
router.get('/widget/summary', projectPlanController.getDashboardWidgetSummary);

// Plan & Charter routes
router.get('/:projectId', projectPlanController.getProjectPlan);
router.put('/:projectId/charter', projectPlanController.saveProjectCharter);

// Milestones CRUD routes
router.get('/:projectId/milestones', projectPlanController.getMilestones);
router.post('/:projectId/milestones', projectPlanController.createMilestone);
router.put('/:projectId/milestones/:id', projectPlanController.updateMilestone);
router.delete('/:projectId/milestones/:id', projectPlanController.deleteMilestone);

module.exports = router;
