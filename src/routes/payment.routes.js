const express = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// Placeholder for payment routes
router.get('/', authenticate, (req, res) => {
  res.json({ message: 'Payment routes - Coming soon' });
});

module.exports = router;
