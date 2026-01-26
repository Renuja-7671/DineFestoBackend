const express = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const reservationController = require('../controllers/reservation.controller');

const router = express.Router();

// All reservation routes require authentication
router.get('/', authenticate, reservationController.getAllReservations);
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), reservationController.getReservationStats);
router.get('/available-tables', authenticate, reservationController.getAvailableTables);
router.get('/:id', authenticate, reservationController.getReservationById);
router.post('/', authenticate, reservationController.createReservation);
router.put('/:id', authenticate, reservationController.updateReservation);
router.put('/:id/cancel', authenticate, reservationController.cancelReservation);
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), reservationController.deleteReservation);

module.exports = router;

module.exports = router;
