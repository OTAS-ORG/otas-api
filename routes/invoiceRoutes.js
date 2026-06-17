const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', invoiceController.getInvoices);
router.get('/:id', invoiceController.getInvoiceById);
router.post('/', invoiceController.createInvoice);
router.put('/:id', invoiceController.updateInvoice);
router.patch('/:id/status', invoiceController.updateStatus);
router.post('/:id/payment', invoiceController.confirmPayment);
router.post('/:id/payout', invoiceController.confirmPayout);
router.post('/:id/lock', invoiceController.lockInvoice);
router.post('/:id/unlock', invoiceController.unlockInvoice);
router.delete('/:id', invoiceController.deleteInvoice);

module.exports = router;
