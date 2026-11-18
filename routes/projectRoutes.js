const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const projectUpdateController = require('../controllers/projectUpdateController');
const { protect } = require('../middleware/authMiddleware');
const { requireTaskRead } = require('../middleware/taskAccess');

router.use(protect);

router.get('/', projectController.getProjects);
router.post('/', projectController.createProject);
router.get('/:id', projectController.getProject);
router.put('/:id', projectUpdateController.updateProject);
router.get('/:projectId/tasks', requireTaskRead, projectController.getTasks);
router.post('/:projectId/tasks', requireTaskRead, projectController.createTask);

module.exports = router;
