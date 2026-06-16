jest.mock('../config/database', () => ({
  order: {
    findUnique: jest.fn(),
  },
  employee: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
}));

jest.mock('../services/inventoryConsumption.service', () => ({
  DEDUCTION_TRIGGER_STATUSES: ['PREPARING', 'READY', 'SERVED', 'COMPLETED'],
  deductInventoryForOrder: jest.fn(),
  restoreInventoryForCancelledOrder: jest.fn(),
}));

const prisma = require('../config/database');
const inventoryConsumptionService = require('../services/inventoryConsumption.service');
const orderController = require('./order.controller');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Order inventory automation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deducts inventory when waiter attends a pending order', async () => {
    const req = {
      params: { id: '31' },
      user: { role: 'WAITER', userId: 7 },
    };
    const res = createMockRes();

    prisma.employee.findUnique.mockResolvedValue({
      employeeId: 44,
      user: { userId: 7 },
    });

    prisma.order.findUnique.mockResolvedValue({
      orderId: 31,
      status: 'PENDING',
      staffId: null,
    });

    prisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        order: {
          update: jest.fn().mockResolvedValue({
            orderId: 31,
            status: 'PREPARING',
            staffId: 44,
            customer: null,
            items: [],
            staff: null,
          }),
        },
      };
      return callback(tx);
    });

    await orderController.attendOrder(req, res);

    expect(inventoryConsumptionService.deductInventoryForOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 31,
      }),
    );
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it('deducts inventory when status moves into PREPARING', async () => {
    const req = {
      params: { id: '17' },
      body: { status: 'PREPARING' },
      user: { role: 'ADMIN', userId: 1 },
    };
    const res = createMockRes();

    prisma.order.findUnique.mockResolvedValue({
      orderId: 17,
      status: 'PENDING',
      staffId: 22,
    });

    const updatedOrder = { orderId: 17, status: 'PREPARING' };
    prisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        order: {
          update: jest.fn().mockResolvedValue(updatedOrder),
        },
      };
      return callback(tx);
    });

    await orderController.updateOrderStatus(req, res);

    expect(inventoryConsumptionService.deductInventoryForOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 17,
      }),
    );
    expect(inventoryConsumptionService.restoreInventoryForCancelledOrder).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it('restores inventory when cancelOrder is called', async () => {
    const req = {
      params: { id: '25' },
      user: {
        role: 'CUSTOMER',
        customerProfile: { customerId: 9 },
      },
    };
    const res = createMockRes();

    prisma.order.findUnique.mockResolvedValue({
      orderId: 25,
      status: 'PENDING',
      customerId: 9,
    });

    const cancelledOrder = {
      orderId: 25,
      status: 'CANCELLED',
      customer: null,
      items: [],
    };

    prisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        order: {
          update: jest.fn().mockResolvedValue(cancelledOrder),
        },
      };
      return callback(tx);
    });

    await orderController.cancelOrder(req, res);

    expect(inventoryConsumptionService.restoreInventoryForCancelledOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 25,
      }),
    );
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it('uses inventory automation when updateOrder changes status', async () => {
    const req = {
      params: { id: '41' },
      body: { status: 'CANCELLED' },
      user: { role: 'MANAGER', userId: 2 },
    };
    const res = createMockRes();

    prisma.order.findUnique.mockResolvedValue({
      orderId: 41,
      status: 'READY',
      staffId: 12,
    });

    prisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        order: {
          update: jest.fn().mockResolvedValue({
            orderId: 41,
            status: 'CANCELLED',
            customer: null,
            items: [],
          }),
        },
      };
      return callback(tx);
    });

    await orderController.updateOrder(req, res);

    expect(inventoryConsumptionService.restoreInventoryForCancelledOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 41,
      }),
    );
    expect(res.status).not.toHaveBeenCalledWith(500);
  });
});
