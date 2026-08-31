const express = require('express');
const router = express.Router();
const multer = require('multer');
const ticketController = require('../controllers/ticketController');
const { protect } = require('../middleware/authMiddleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Cron endpoint (accessible by Vercel Cron or Serverless runner without user JWT)
router.get('/check-reminders', ticketController.triggerDueReminders);
router.post('/check-reminders', ticketController.triggerDueReminders);

router.use(protect);

router.post('/upload', upload.single('file'), ticketController.uploadTicketAttachment);
router.get('/departments', ticketController.getDepartments);
router.get('/users/:department_id', ticketController.getUsersByDepartment);

router.get('/', ticketController.getTickets);
router.post('/', ticketController.createTicket);
router.get('/:id', ticketController.getTicketById);
router.put('/:id/assign', ticketController.assignTicket);
router.put('/:id/status', ticketController.updateStatus);
router.post('/:id/comments', ticketController.addComment);
router.post('/:id/comments/:commentId/reactions', ticketController.toggleCommentReaction);
router.delete('/:id', ticketController.deleteTicket);

module.exports = router;
