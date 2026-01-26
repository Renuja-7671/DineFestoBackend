const express = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// Placeholder for user routes
router.get('/', authenticate, authorize('ADMIN'), (req, res) => {
  res.json({ message: 'User routes - Coming soon' });
});

module.exports = router;
