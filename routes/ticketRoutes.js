const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/departments', ticketController.getDepartments);
router.get('/users/:department_id', ticketController.getUsersByDepartment);

router.get('/', ticketController.getTickets);
router.post('/', ticketController.createTicket);
router.get('/:id', ticketController.getTicketById);
router.put('/:id/assign', ticketController.assignTicket);
router.put('/:id/status', ticketController.updateStatus);
router.post('/:id/comments', ticketController.addComment);
router.delete('/:id', ticketController.deleteTicket);

module.exports = router;
