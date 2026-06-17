const prisma = require('../config/database');
const inventoryConsumptionService = require('../services/inventoryConsumption.service');

const VALID_ORDER_TYPES = ['DINE_IN', 'TAKEAWAY'];

const mapOrderCustomer = (order) => {
  if (order.customer) {
    return {
      ...order.customer,
      fullName: order.customer.fullName || order.customer.user?.fullName || 'N/A',
      email: order.customer.user?.email || 'N/A',
      phoneNumber: order.customer.phoneNumber || order.customer.user?.phoneNumber || 'N/A',
    };
  }

  if (order.guestName) {
    return {
      fullName: order.guestName,
      email: 'Walk-in Customer',
      phoneNumber: order.guestPhone || 'N/A',
      isGuest: true,
    };
  }

  return null;
};

const mapOrderItems = (items = []) =>
  items.map((item) => ({
    ...item,
    price: item.unitPrice,
  }));

const mapOrderForList = (order) => ({
  orderId: order.orderId,
  id: order.orderId,
  customerId: order.customerId,
  staffId: order.staffId,
  guestName: order.guestName,
  guestPhone: order.guestPhone,
  status: order.status,
  type: order.type,
  tableNumber: order.tableNumber,
  totalAmount: order.totalAmount,
  createdAt: order.createdAt,
  customer: mapOrderCustomer(order),
  staff: order.staff
    ? {
        ...order.staff,
        fullName: order.staff.fullName || order.staff.user?.fullName || 'N/A',
      }
    : null,
  _count: {
    orderItems: order._count?.items ?? order.items?.length ?? 0,
  },
});

const mapOrderForDetail = (order) => ({
  ...order,
  id: order.orderId,
  orderItems: mapOrderItems(order.items),
  customer: mapOrderCustomer(order),
});

const mapOrderForListWithItems = (order) => ({
  ...mapOrderForList(order),
  items: mapOrderItems(order.items || []),
  orderItems: mapOrderItems(order.items || []),
});

const orderListInclude = {
  customer: {
    include: {
      user: true,
    },
  },
  staff: {
    include: {
      user: true,
    },
  },
  items: {
    include: {
      menuItem: {
        select: {
          itemId: true,
          name: true,
          price: true,
          imageUrl: true,
        },
      },
    },
  },
  _count: {
    select: { items: true },
  },
};

const buildOrderWhereClause = (req) => {
  const { status, customerId, startDate, endDate, search, type, statusGroup } = req.query;
  const where = {};

  if (statusGroup === 'ACTIVE') {
    where.status = { in: ['PENDING', 'PREPARING', 'READY'] };
  } else if (statusGroup === 'COMPLETED') {
    where.status = { in: ['SERVED', 'COMPLETED'] };
  } else if (statusGroup === 'HISTORY') {
    where.status = { in: ['SERVED', 'COMPLETED', 'CANCELLED'] };
  } else if (status && status !== 'ALL') {
    where.status = status;
  }

  if (type && type !== 'ALL') {
    where.type = type;
  }

  if (customerId) {
    where.customerId = parseInt(customerId, 10);
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  if (req.user.role === 'CUSTOMER' && req.user.customerProfile) {
    where.customerId = req.user.customerProfile.customerId;
  }

  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    const searchConditions = [
      { guestName: { contains: trimmedSearch, mode: 'insensitive' } },
      {
        customer: {
          is: {
            fullName: { contains: trimmedSearch, mode: 'insensitive' },
          },
        },
      },
      {
        customer: {
          is: {
            user: {
              is: {
                email: { contains: trimmedSearch, mode: 'insensitive' },
              },
            },
          },
        },
      },
      {
        staff: {
          is: {
            fullName: { contains: trimmedSearch, mode: 'insensitive' },
          },
        },
      },
    ];

    if (/^\d+$/.test(trimmedSearch)) {
      searchConditions.unshift({ orderId: parseInt(trimmedSearch, 10) });
    }

    where.OR = searchConditions;
  }

  return where;
};

const parsePagination = (query) => {
  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);

  return { hasPagination, page, limit, skip: (page - 1) * limit };
};

// Get all orders with filters
exports.getAllOrders = async (req, res) => {
  try {
    const where = buildOrderWhereClause(req);
    const { hasPagination, page, limit, skip } = parsePagination(req.query);

    if (hasPagination) {
      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          skip,
          take: limit,
          include: orderListInclude,
          orderBy: {
            createdAt: 'desc',
          },
        }),
        prisma.order.count({ where }),
      ]);

      return res.json({
        success: true,
        data: orders.map(mapOrderForListWithItems),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 0,
        },
      });
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        customer: {
          include: {
            user: true,
          },
        },
        staff: {
          include: {
            user: true,
          },
        },
        items: {
          include: {
            menuItem: {
              include: {
                category: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({
      success: true,
      data: orders.map(mapOrderForListWithItems),
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message,
    });
  }
};

// Get single order by ID
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { orderId: parseInt(id) },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
        staff: {
          include: {
            user: true,
          },
        },
        items: {
          include: {
            menuItem: {
              include: {
                category: true,
              },
            },
          },
        },
        payment: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Check if customer is authorized to view this order
    if (req.user.role === 'CUSTOMER' && req.user.customerProfile) {
      if (order.customerId !== req.user.customerProfile.customerId) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view this order',
        });
      }
    }

    // Map orderId to id for frontend consistency
    const mappedOrder = mapOrderForDetail(order);

    res.json({
      success: true,
      data: mappedOrder,
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error.message,
    });
  }
};

// Create new order
exports.createOrder = async (req, res) => {
  try {
    let { customerId, type, tableNumber, items, guestName, guestPhone, userId } = req.body;

    // Validate required fields
    // customerId can be null for walk-in/guest customers
    if (!type || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order type and items are required',
      });
    }

    if (!VALID_ORDER_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order type. Only DINE_IN and TAKEAWAY are supported.',
      });
    }

    // If customerId is null but userId is provided (staff member ordering)
    // Create a customer profile for them automatically
    if (!customerId && userId) {
      const user = await prisma.user.findUnique({
        where: { userId: parseInt(userId) },
        include: {
          employeeProfile: true,
          customerProfile: true,
        },
      });

      if (user && !user.customerProfile && user.employeeProfile) {
        // Create customer profile for staff member
        const newCustomerProfile = await prisma.customer.create({
          data: {
            userId: user.userId,
            fullName: user.employeeProfile.fullName,
            phoneNumber: user.employeeProfile.contact || null,
            loyaltyPoints: 0,
          },
        });
        customerId = newCustomerProfile.customerId;
        console.log(`Created customer profile for staff member ${user.email}: customerId ${customerId}`);
      } else if (user && user.customerProfile) {
        customerId = user.customerProfile.customerId;
      }
    }

    // If no customerId provided after attempting staff conversion, ensure guest details are provided
    if (!customerId && (!guestName || guestName.trim() === '')) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID, User ID, or Guest name is required',
      });
    }

    // Calculate total amount
    let totalAmount = 0;
    const orderItemsData = [];

    for (const item of items) {
      const menuItem = await prisma.menuItem.findUnique({
        where: { itemId: item.menuItemId },
      });

      if (!menuItem) {
        return res.status(404).json({
          success: false,
          message: `Menu item with ID ${item.menuItemId} not found`,
        });
      }

      if (!menuItem.isAvailable) {
        return res.status(400).json({
          success: false,
          message: `Menu item ${menuItem.name} is not available`,
        });
      }

      const itemTotal = menuItem.price * item.quantity;
      totalAmount += itemTotal;

      orderItemsData.push({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: menuItem.price,
        customization: item.notes || item.customization,
      });
    }

    // Get the staff member (employee) who is creating this order
    // This will track which staff member handled/created the order
    let staffId = null;
    if (req.user) {
      const userWithEmployee = await prisma.user.findUnique({
        where: { userId: req.user.userId },
        include: { employeeProfile: true },
      });
      
      if (userWithEmployee?.employeeProfile) {
        staffId = userWithEmployee.employeeProfile.employeeId;
        console.log(`Order being created by staff member: ${userWithEmployee.email} (Employee ID: ${staffId})`);
      }
    }

    // Create order with order items
    const order = await prisma.order.create({
      data: {
        customerId: customerId ? parseInt(customerId) : null,
        guestName: !customerId ? guestName : null,
        guestPhone: !customerId ? guestPhone : null,
        staffId: staffId, // Track which staff member created/handled this order
        type,
        tableNumber,
        totalAmount,
        status: 'PENDING',
        items: {
          create: orderItemsData,
        },
      },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
        items: {
          include: {
            menuItem: true,
          },
        },
      },
    });

    // Map orderId to id and items to orderItems for frontend consistency
    const mappedOrder = {
      ...order,
      id: order.orderId,
      orderItems: order.items?.map(item => ({
        ...item,
        price: item.unitPrice,
      })) || [],
      customer: order.customer ? {
        ...order.customer,
        fullName: order.customer.fullName || order.customer.user?.fullName || 'N/A',
        email: order.customer.user?.email || 'N/A',
        phoneNumber: order.customer.phoneNumber || order.customer.user?.phoneNumber || 'N/A',
      } : (order.guestName ? {
        fullName: order.guestName,
        email: 'Walk-in Customer',
        phoneNumber: order.guestPhone || 'N/A',
        isGuest: true,
      } : null),
    };

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: mappedOrder,
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message,
    });
  }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userRole = req.user.role;
    const userId = req.user.userId;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required',
      });
    }

    // Validate status
    const validStatuses = ['PENDING', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
      });
    }

    // Check if order exists
    const existingOrder = await prisma.order.findUnique({
      where: { orderId: parseInt(id) },
      include: {
        staff: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // AUTHORIZATION: Waiters can only update their own orders
    // Admins and Managers can update any order
    if (userRole === 'WAITER') {
      // Get the employee record for the current user
      const employee = await prisma.employee.findUnique({
        where: { userId },
      });

      // Check if this order belongs to the current waiter
      if (existingOrder.staffId !== employee?.employeeId) {
        return res.status(403).json({
          success: false,
          message: 'You can only update orders that are assigned to you',
        });
      }
    }
    // ADMIN, MANAGER, and CHEF can update any order (no restriction)

    const parsedOrderId = parseInt(id, 10);
    const previousStatus = existingOrder.status;

    const order = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { orderId: parsedOrderId },
        data: { status },
        include: {
          customer: {
            include: {
              user: true,
            },
          },
          items: {
            include: {
              menuItem: true,
            },
          },
          staff: {
            include: {
              user: true,
            },
          },
        },
      });

      const movedIntoDeductionStatus =
        !inventoryConsumptionService.DEDUCTION_TRIGGER_STATUSES.includes(previousStatus) &&
        inventoryConsumptionService.DEDUCTION_TRIGGER_STATUSES.includes(status);

      if (movedIntoDeductionStatus) {
        await inventoryConsumptionService.deductInventoryForOrder({
          orderId: parsedOrderId,
          note: `Auto deduction triggered on status ${status}`,
          tx,
        });
      }

      if (status === 'CANCELLED' && previousStatus !== 'CANCELLED') {
        await inventoryConsumptionService.restoreInventoryForCancelledOrder({
          orderId: parsedOrderId,
          note: 'Inventory restored after order cancellation',
          tx,
        });
      }

      return updatedOrder;
    }, {
      maxWait: 10000,
      timeout: 30000,
    });

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: order,
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status',
      error: error.message,
    });
  }
};

// Attend to an order (for waiters)
exports.attendOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const parsedOrderId = parseInt(id, 10);

    // Get employee record for the current user
    const employee = await prisma.employee.findUnique({
      where: { userId },
      include: {
        user: true,
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found',
      });
    }

    // Check if order exists
    const existingOrder = await prisma.order.findUnique({
      where: { orderId: parsedOrderId },
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Check if order is PENDING
    if (existingOrder.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Only PENDING orders can be attended',
      });
    }

    // Check if order already has a staff assigned
    if (existingOrder.staffId) {
      return res.status(400).json({
        success: false,
        message: 'This order has already been attended by another staff member',
      });
    }

    // Update order to PREPARING status, assign staff, and deduct inventory
    const order = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { orderId: parsedOrderId },
        data: {
          status: 'PREPARING',
          staffId: employee.employeeId,
        },
        include: {
          customer: {
            include: {
              user: true,
            },
          },
          items: {
            include: {
              menuItem: true,
            },
          },
          staff: {
            include: {
              user: true,
            },
          },
        },
      });

      await inventoryConsumptionService.deductInventoryForOrder({
        orderId: parsedOrderId,
        note: 'Auto deduction triggered on attend (PREPARING)',
        tx,
      });

      return updatedOrder;
    }, {
      maxWait: 10000,
      timeout: 30000,
    });

    res.json({
      success: true,
      message: 'Order attended successfully',
      data: order,
    });
  } catch (error) {
    console.error('Error attending order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to attend order',
      error: error.message,
    });
  }
};

// Update entire order
exports.updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, tableNumber, status } = req.body;
    const parsedOrderId = parseInt(id, 10);

    // Check if order exists
    const existingOrder = await prisma.order.findUnique({
      where: { orderId: parsedOrderId },
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    const updateData = {};
    if (type !== undefined) {
      if (!VALID_ORDER_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid order type. Only DINE_IN and TAKEAWAY are supported.',
        });
      }
      updateData.type = type;
    }
    if (tableNumber !== undefined) updateData.tableNumber = tableNumber;
    if (status !== undefined) {
      const validStatuses = ['PENDING', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status',
        });
      }
      updateData.status = status;
    }

    const order = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { orderId: parsedOrderId },
        data: updateData,
        include: {
          customer: {
            include: {
              user: true,
            },
          },
          items: {
            include: {
              menuItem: true,
            },
          },
        },
      });

      if (status !== undefined) {
        const movedIntoDeductionStatus =
          !inventoryConsumptionService.DEDUCTION_TRIGGER_STATUSES.includes(existingOrder.status) &&
          inventoryConsumptionService.DEDUCTION_TRIGGER_STATUSES.includes(status);

        if (movedIntoDeductionStatus) {
          await inventoryConsumptionService.deductInventoryForOrder({
            orderId: parsedOrderId,
            note: `Auto deduction triggered on status ${status} via order update`,
            tx,
          });
        }

        if (status === 'CANCELLED' && existingOrder.status !== 'CANCELLED') {
          await inventoryConsumptionService.restoreInventoryForCancelledOrder({
            orderId: parsedOrderId,
            note: 'Inventory restored after order cancellation via order update',
            tx,
          });
        }
      }

      return updatedOrder;
    }, {
      maxWait: 10000,
      timeout: 30000,
    });

    res.json({
      success: true,
      message: 'Order updated successfully',
      data: order,
    });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order',
      error: error.message,
    });
  }
};

// Delete order
exports.deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if order exists
    const existingOrder = await prisma.order.findUnique({
      where: { orderId: parseInt(id) },
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Delete order (OrderItems will be cascade deleted if configured in schema)
    await prisma.order.delete({
      where: { orderId: parseInt(id) },
    });

    res.json({
      success: true,
      message: 'Order deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete order',
      error: error.message,
    });
  }
};

// Cancel order (for customers)
exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if order exists
    const existingOrder = await prisma.order.findUnique({
      where: { orderId: parseInt(id) },
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Check if customer is authorized to cancel this order
    if (req.user.role === 'CUSTOMER' && req.user.customerProfile) {
      if (existingOrder.customerId !== req.user.customerProfile.customerId) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to cancel this order',
        });
      }
    }

    // Only allow cancelling pending orders
    if (existingOrder.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order with status: ${existingOrder.status}. Only PENDING orders can be cancelled.`,
      });
    }

    // Update order status to CANCELLED
    const cancelledOrder = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { orderId: parseInt(id, 10) },
        data: { status: 'CANCELLED' },
        include: {
          customer: {
            include: {
              user: true,
            },
          },
          items: {
            include: {
              menuItem: true,
            },
          },
        },
      });

      await inventoryConsumptionService.restoreInventoryForCancelledOrder({
        orderId: parseInt(id, 10),
        note: 'Inventory restored after customer cancellation',
        tx,
      });

      return updatedOrder;
    }, {
      maxWait: 10000,
      timeout: 30000,
    });

    // Map orderId to id for frontend consistency
    const mappedOrder = {
      ...cancelledOrder,
      id: cancelledOrder.orderId,
      orderItems: cancelledOrder.items?.map(item => ({
        ...item,
        price: item.unitPrice,
      })) || [],
      customer: cancelledOrder.customer ? {
        ...cancelledOrder.customer,
        fullName: cancelledOrder.customer.fullName || cancelledOrder.customer.user?.fullName || 'N/A',
        email: cancelledOrder.customer.user?.email || 'N/A',
        phoneNumber: cancelledOrder.customer.phoneNumber || cancelledOrder.customer.user?.phoneNumber || 'N/A',
      } : null,
    };

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: mappedOrder,
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
      error: error.message,
    });
  }
};

// Get order statistics
exports.getOrderStats = async (req, res) => {
  try {
    const totalOrders = await prisma.order.count();
    const pendingOrders = await prisma.order.count({ where: { status: 'PENDING' } });
    const confirmedOrders = await prisma.order.count({ where: { status: 'CONFIRMED' } });
    const preparingOrders = await prisma.order.count({ where: { status: 'PREPARING' } });
    const deliveredOrders = await prisma.order.count({ where: { status: 'DELIVERED' } });
    const cancelledOrders = await prisma.order.count({ where: { status: 'CANCELLED' } });

    const totalRevenue = await prisma.order.aggregate({
      where: { status: { not: 'CANCELLED' } },
      _sum: { totalAmount: true },
    });

    res.json({
      success: true,
      data: {
        totalOrders,
        pendingOrders,
        confirmedOrders,
        preparingOrders,
        deliveredOrders,
        cancelledOrders,
        totalRevenue: totalRevenue._sum.totalAmount || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching order stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order statistics',
      error: error.message,
    });
  }
};
