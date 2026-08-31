const express = require('express');
const router = express.Router();
const multer = require('multer');
const projectController = require('../controllers/projectController');
const { protect } = require('../middleware/authMiddleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

router.use(protect);

router.post('/upload', upload.single('file'), projectController.uploadTaskAttachment);
router.get('/:taskId', projectController.getTask);
router.patch('/:taskId/status', projectController.updateTaskStatus);
router.put('/:taskId', projectController.updateTask);
router.delete('/:taskId', projectController.deleteTask);
router.get('/:taskId/comments', projectController.getComments);
router.post('/:taskId/comments', projectController.addComment);
router.post('/:taskId/comments/:commentId/reactions', projectController.toggleTaskCommentReaction);

module.exports = router;
