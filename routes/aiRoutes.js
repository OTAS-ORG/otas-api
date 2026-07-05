const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { chat, chatSync, generateContent, analyzeClient, suggestTicket, getModels } = require('../controllers/aiController');

const router = express.Router();

router.use(protect);

router.post('/chat', chatSync);
router.post('/chat/stream', chat);
router.post('/generate', generateContent);
router.post('/analyze-client', analyzeClient);
router.post('/suggest-ticket', suggestTicket);
router.get('/models', getModels);

module.exports = router;
