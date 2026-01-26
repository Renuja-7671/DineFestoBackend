const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// Placeholder for notification routes
router.get('/', authenticate, (req, res) => {
  res.json({ message: 'Notification routes - Coming soon' });
});

module.exports = router;
