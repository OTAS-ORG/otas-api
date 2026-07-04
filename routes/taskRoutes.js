const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/:taskId', projectController.getTask);
router.patch('/:taskId/status', projectController.updateTaskStatus);
router.put('/:taskId', projectController.updateTask);
router.delete('/:taskId', projectController.deleteTask);
router.get('/:taskId/comments', projectController.getComments);
router.post('/:taskId/comments', projectController.addComment);

module.exports = router;
