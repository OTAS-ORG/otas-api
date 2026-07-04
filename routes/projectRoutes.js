const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', projectController.getProjects);
router.post('/', projectController.createProject);
router.get('/:id', projectController.getProject);
router.get('/:projectId/tasks', projectController.getTasks);
router.post('/:projectId/tasks', projectController.createTask);

module.exports = router;
