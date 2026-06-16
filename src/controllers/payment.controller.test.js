jest.mock('../services/stripe.service', () => ({
  createRefund: jest.fn(),
}));

jest.mock('../services/inventoryConsumption.service', () => ({
  restoreInventoryForCancelledOrder: jest.fn(),
}));

jest.mock('../config/database', () => ({
  payment: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
}));

const stripeService = require('../services/stripe.service');
const inventoryConsumptionService = require('../services/inventoryConsumption.service');
const prisma = require('../config/database');
const paymentController = require('./payment.controller');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Payment inventory sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('restores inventory when a refund cancels the order', async () => {
    const req = {
      params: { paymentId: '55' },
      body: {},
    };
    const res = createMockRes();

    prisma.payment.findUnique.mockResolvedValue({
      paymentId: 55,
      orderId: 901,
      amount: 2500,
      status: 'COMPLETED',
      transactionId: 'pi_abc123',
      order: { orderId: 901 },
    });

    stripeService.createRefund.mockResolvedValue({
      id: 're_001',
      status: 'succeeded',
    });

    prisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        payment: {
          update: jest.fn().mockResolvedValue({
            paymentId: 55,
            status: 'REFUNDED',
          }),
        },
        order: {
          update: jest.fn().mockResolvedValue({
            orderId: 901,
            status: 'CANCELLED',
          }),
        },
      };

      return callback(tx);
    });

    await paymentController.requestRefund(req, res);

    expect(inventoryConsumptionService.restoreInventoryForCancelledOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 901,
      }),
    );
    expect(res.status).not.toHaveBeenCalledWith(500);
  });
});
