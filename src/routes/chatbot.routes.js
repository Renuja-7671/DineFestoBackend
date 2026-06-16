const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const chatbotController = require('../controllers/chatbot.controller');

const router = express.Router();

router.get('/status', authenticate, chatbotController.getChatbotStatus);
router.post('/message', authenticate, chatbotController.sendMessage);

module.exports = router;
