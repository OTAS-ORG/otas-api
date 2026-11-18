const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { protect } = require('../middleware/authMiddleware');
const { requireTaskRead, requireCeo, noHardDelete, prepareTaskWrite } = require('../middleware/taskAccess');

router.use(protect);
// Upload lacks a task ID and therefore cannot be authorized against a record.
router.post('/upload', noHardDelete);
router.get('/:taskId', requireTaskRead, projectController.getTask);
router.patch('/:taskId/status', prepareTaskWrite, projectController.updateTaskStatus);
router.put('/:taskId', prepareTaskWrite, projectController.updateTask);
router.delete('/:taskId', noHardDelete);
// Legacy comments contain unclassified free text and are temporarily CEO-only.
router.get('/:taskId/comments', requireCeo, projectController.getComments);
router.post('/:taskId/comments', requireCeo, projectController.addComment);
router.post('/:taskId/comments/:commentId/reactions', requireCeo, projectController.toggleTaskCommentReaction);

module.exports = router;
