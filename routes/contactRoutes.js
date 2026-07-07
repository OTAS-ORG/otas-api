const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { submitContact, getContacts, getContact, updateContact, deleteContact } = require('../controllers/contactController');

const router = express.Router();

router.post('/', submitContact);

router.get('/', protect, getContacts);
router.get('/:id', protect, getContact);
router.put('/:id', protect, updateContact);
router.delete('/:id', protect, deleteContact);

module.exports = router;
