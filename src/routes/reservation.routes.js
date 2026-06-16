const express = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const reservationController = require('../controllers/reservation.controller');

const router = express.Router();

// All reservation routes require authentication
router.get('/', authenticate, reservationController.getAllReservations);
router.get('/config', authenticate, reservationController.getReservationConfig);
router.get('/stats', authenticate, authorize('ADMIN', 'MANAGER'), reservationController.getReservationStats);
router.get('/available-tables', authenticate, reservationController.getAvailableTables);
router.post('/payment-intent', authenticate, reservationController.createReservationPaymentIntent);
router.post('/confirm-with-payment', authenticate, reservationController.confirmReservationWithPayment);
router.get('/:id', authenticate, reservationController.getReservationById);
router.post('/', authenticate, reservationController.createReservation);
router.put('/:id', authenticate, reservationController.updateReservation);
router.patch('/:id/record-physical-payment', authenticate, authorize('ADMIN', 'MANAGER'), reservationController.recordPhysicalPayment);
router.patch('/:id/record-online-payment', authenticate, authorize('ADMIN', 'MANAGER'), reservationController.recordOnlinePayment);
router.put('/:id/cancel', authenticate, reservationController.cancelReservation);
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), reservationController.deleteReservation);

module.exports = router;
