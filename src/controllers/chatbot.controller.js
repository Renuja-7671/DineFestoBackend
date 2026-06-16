const { generateChatReply, isGeminiConfigured } = require('../services/gemini.service');
const { buildRestaurantContext } = require('../services/chatbotContext.service');

exports.getChatbotStatus = async (req, res) => {
  res.json({
    success: true,
    data: {
      enabled: isGeminiConfigured(),
      role: req.user.role,
    },
  });
};

exports.sendMessage = async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required',
      });
    }

    if (String(message).trim().length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Message is too long (max 2000 characters)',
      });
    }

    if (!Array.isArray(history)) {
      return res.status(400).json({
        success: false,
        message: 'History must be an array',
      });
    }

    if (!isGeminiConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Chat assistant is not configured yet. Please add GEMINI_API_KEY to the server environment.',
      });
    }

    const trimmedMessage = String(message).trim();
    const restaurantContext = await buildRestaurantContext(req.user, trimmedMessage);

    const reply = await generateChatReply({
      role: req.user.role,
      message: trimmedMessage,
      history,
      restaurantContext,
    });

    res.json({
      success: true,
      data: {
        reply,
        role: req.user.role,
        usedDatabaseContext: true,
      },
    });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get assistant response',
    });
  }
};
