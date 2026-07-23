const express = require('express');
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware');
const { uploadDocument, getDocuments, deleteDocument } = require('../controllers/documentController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', protect, upload.array('files'), uploadDocument);
router.get('/', protect, getDocuments);
router.delete('/:id', protect, deleteDocument);

module.exports = router;
