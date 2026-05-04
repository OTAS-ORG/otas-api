const express = require('express');
const router = express.Router();
const publicFormController = require('../controllers/publicFormController');
const uploadController = require('../controllers/uploadController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// NO AUTH REQUIRED FOR THESE ROUTES
router.get('/client-info/:id', publicFormController.getPublicClientInfo);
router.post('/submit', publicFormController.submitPublicForm);
router.post('/upload', upload.array('files'), uploadController.uploadFiles);

module.exports = router;
