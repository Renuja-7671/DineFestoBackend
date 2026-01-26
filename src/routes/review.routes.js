const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/review.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Get all reviews (admin/manager can see all, customers can see public reviews)
router.get('/', authenticate, reviewController.getAllReviews);

// Get review statistics (admin/manager only)
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), reviewController.getReviewStats);

// Get reviews for a specific menu item
router.get('/menu-item/:menuItemId', reviewController.getMenuItemReviews);

// Get a specific review by ID
router.get('/:id', authenticate, reviewController.getReviewById);

// Create a new review (authenticated users only)
router.post('/', authenticate, reviewController.createReview);

// Update a review (authenticated users only - ideally should check if user owns the review)
router.put('/:id', authenticate, reviewController.updateReview);

// Delete a review (admin/manager only, or review owner)
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), reviewController.deleteReview);

module.exports = router;
