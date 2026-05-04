const express = require('express');
const router = express.Router();
const clientFormController = require('../controllers/clientFormController');
const uploadController = require('../controllers/uploadController');
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

router.post('/submit', clientFormController.submitForm);
router.post('/upload', upload.array('files'), uploadController.uploadFiles);

module.exports = router;
