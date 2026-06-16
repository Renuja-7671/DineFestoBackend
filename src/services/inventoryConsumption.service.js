const prisma = require('../config/database');

const DEDUCTION_TRIGGER_STATUSES = ['PREPARING', 'READY', 'SERVED', 'COMPLETED'];

const buildRequiredIngredients = (order) => {
  const requiredByInventoryId = new Map();

  for (const orderItem of order.items) {
    const recipe = orderItem.menuItem.recipe;

    if (!recipe || recipe.length === 0) {
      throw new Error(`Recipe is not configured for menu item: ${orderItem.menuItem.name}`);
    }

    for (const recipeItem of recipe) {
      const requiredQty = Number(recipeItem.quantityUsed) * orderItem.quantity;
      const existing = requiredByInventoryId.get(recipeItem.inventoryId);

      if (existing) {
        existing.requiredQty += requiredQty;
      } else {
        requiredByInventoryId.set(recipeItem.inventoryId, {
          inventoryId: recipeItem.inventoryId,
          itemName: recipeItem.inventory.itemName,
          unit: recipeItem.inventory.unit,
          requiredQty,
        });
      }
    }
  }

  return Array.from(requiredByInventoryId.values());
};

const getOrderWithRecipe = (client, orderId) => {
  return client.order.findUnique({
    where: { orderId },
    include: {
      items: {
        include: {
          menuItem: {
            include: {
              recipe: {
                include: {
                  inventory: true,
                },
              },
            },
          },
        },
      },
    },
  });
};

const createLowStockAlerts = async (client, inventoryItem) => {
  const currentQty = Number(inventoryItem.quantity);
  const reorderLevel = Number(inventoryItem.reorderLevel);

  if (currentQty > reorderLevel) {
    return;
  }

  const alertUsers = await client.user.findMany({
    where: {
      role: {
        in: ['ADMIN', 'MANAGER', 'CHEF'],
      },
    },
    select: {
      userId: true,
    },
  });

  if (alertUsers.length === 0) {
    return;
  }

  const alertMessage = `Low stock alert: ${inventoryItem.itemName} is at ${currentQty.toFixed(3)} ${inventoryItem.unit} (reorder level ${reorderLevel.toFixed(3)} ${inventoryItem.unit}).`;

  // Deduplicate: skip users who already have an unread low-stock notification for this item
  const existingUnread = await client.notification.findMany({
    where: {
      type: 'LOW_STOCK',
      isRead: false,
      message: { contains: inventoryItem.itemName },
    },
    select: { userId: true },
  });

  const usersWithExistingAlert = new Set(existingUnread.map((n) => n.userId));
  const usersToNotify = alertUsers.filter((u) => !usersWithExistingAlert.has(u.userId));

  if (usersToNotify.length === 0) {
    return;
  }

  await client.notification.createMany({
    data: usersToNotify.map((user) => ({
      userId: user.userId,
      type: 'LOW_STOCK',
      message: alertMessage,
      isRead: false,
    })),
  });
};

/**
 * Create STOCK_RESTORED notifications for admin/manager/chef when an item
 * is replenished above its reorder level.
 */
const createStockRestoredAlert = async (client, inventoryItem) => {
  const currentQty = Number(inventoryItem.quantity);
  const reorderLevel = Number(inventoryItem.reorderLevel);

  // Only fire when freshly above threshold
  if (currentQty <= reorderLevel) {
    return;
  }

  const alertUsers = await client.user.findMany({
    where: { role: { in: ['ADMIN', 'MANAGER', 'CHEF'] } },
    select: { userId: true },
  });

  if (alertUsers.length === 0) {
    return;
  }

  const restoredMessage = `Stock restored: ${inventoryItem.itemName} is now at ${currentQty.toFixed(3)} ${inventoryItem.unit} (above reorder level of ${reorderLevel.toFixed(3)} ${inventoryItem.unit}).`;

  // Only notify users who had an unread LOW_STOCK alert for this item
  // (no point in spamming everyone every time stock is topped up)
  const existingLowStockNotifs = await client.notification.findMany({
    where: {
      type: 'LOW_STOCK',
      isRead: false,
      message: { contains: inventoryItem.itemName },
    },
    select: { userId: true },
  });

  const usersToNotify = existingLowStockNotifs.map((n) => ({ userId: n.userId }));

  if (usersToNotify.length === 0) {
    return;
  }

  await client.notification.createMany({
    data: usersToNotify.map((user) => ({
      userId: user.userId,
      type: 'STOCK_RESTORED',
      message: restoredMessage,
      isRead: false,
    })),
    skipDuplicates: true,
  });
};

const deductInventoryForOrder = async ({ orderId, note, tx }) => {
  const client = tx || prisma;
  const parsedOrderId = parseInt(orderId, 10);

  if (Number.isNaN(parsedOrderId)) {
    throw new Error('Invalid order id');
  }

  const order = await getOrderWithRecipe(client, parsedOrderId);

  if (!order) {
    throw new Error('Order not found');
  }

  if (order.inventoryDeductedAt) {
    return { skipped: true, reason: 'Inventory already deducted for this order' };
  }

  const requiredIngredients = buildRequiredIngredients(order);

  for (const ingredient of requiredIngredients) {
    const inventoryItem = await client.inventoryItem.findUnique({
      where: { inventoryId: ingredient.inventoryId },
    });

    if (!inventoryItem) {
      throw new Error(`Inventory item not found for recipe: ${ingredient.itemName}`);
    }

    const nextQty = Number(inventoryItem.quantity) - ingredient.requiredQty;
    if (nextQty < 0) {
      throw new Error(
        `Insufficient stock for ${ingredient.itemName}. Required ${ingredient.requiredQty.toFixed(3)} ${ingredient.unit}, available ${Number(inventoryItem.quantity).toFixed(3)} ${ingredient.unit}`,
      );
    }
  }

  for (const ingredient of requiredIngredients) {
    const updatedInventoryItem = await client.inventoryItem.update({
      where: { inventoryId: ingredient.inventoryId },
      data: {
        quantity: {
          decrement: ingredient.requiredQty,
        },
      },
    });

    await createLowStockAlerts(client, updatedInventoryItem);

    await client.inventoryLedger.create({
      data: {
        inventoryId: ingredient.inventoryId,
        movementType: 'ORDER_CONSUMPTION',
        quantityChange: -ingredient.requiredQty,
        referenceOrderId: parsedOrderId,
        note: note || `Auto deduction for order #${parsedOrderId}`,
      },
    });
  }

  await client.order.update({
    where: { orderId: parsedOrderId },
    data: {
      inventoryDeductedAt: new Date(),
    },
  });

  // Auto-mark menu items unavailable if any ingredient just hit zero
  const deductedInventoryIds = requiredIngredients.map((i) => i.inventoryId);
  await syncMenuItemAvailability(deductedInventoryIds, client);

  return {
    skipped: false,
    deductedItems: requiredIngredients,
  };
};

const restoreInventoryForCancelledOrder = async ({ orderId, note, tx }) => {
  const client = tx || prisma;
  const parsedOrderId = parseInt(orderId, 10);

  if (Number.isNaN(parsedOrderId)) {
    throw new Error('Invalid order id');
  }

  const order = await client.order.findUnique({
    where: { orderId: parsedOrderId },
    select: { orderId: true, inventoryDeductedAt: true },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  if (!order.inventoryDeductedAt) {
    return { skipped: true, reason: 'Inventory was not deducted for this order' };
  }

  const consumedEntries = await client.inventoryLedger.findMany({
    where: {
      referenceOrderId: parsedOrderId,
      movementType: 'ORDER_CONSUMPTION',
    },
  });

  if (consumedEntries.length === 0) {
    await client.order.update({
      where: { orderId: parsedOrderId },
      data: { inventoryDeductedAt: null },
    });

    return { skipped: true, reason: 'No prior consumption ledger entries found' };
  }

  for (const entry of consumedEntries) {
    const quantityToRestore = Math.abs(Number(entry.quantityChange));

    await client.inventoryItem.update({
      where: { inventoryId: entry.inventoryId },
      data: {
        quantity: {
          increment: quantityToRestore,
        },
      },
    });

    await client.inventoryLedger.create({
      data: {
        inventoryId: entry.inventoryId,
        movementType: 'CANCELLATION_RETURN',
        quantityChange: quantityToRestore,
        referenceOrderId: parsedOrderId,
        note: note || `Inventory restored for cancelled order #${parsedOrderId}`,
      },
    });
  }

  await client.order.update({
    where: { orderId: parsedOrderId },
    data: { inventoryDeductedAt: null },
  });

  // Re-enable menu items whose ingredients are all back in stock
  const restoredInventoryIds = consumedEntries.map((e) => e.inventoryId);
  await syncMenuItemAvailability(restoredInventoryIds, client);

  return {
    skipped: false,
    restoredCount: consumedEntries.length,
  };
};

/**
 * For each inventory item in `inventoryIds`, find every menu item whose
 * recipe includes that ingredient, then set isAvailable = false if ANY of
 * its ingredients are at zero stock, or true when all are back above zero.
 */
const syncMenuItemAvailability = async (inventoryIds, client) => {
  if (!inventoryIds || inventoryIds.length === 0) return;

  const db = client || prisma;

  // Find all distinct menu items that reference any of the changed inventory items
  const affectedRecipes = await db.recipeIngredient.findMany({
    where: { inventoryId: { in: inventoryIds } },
    select: { menuItemId: true },
    distinct: ['menuItemId'],
  });

  if (affectedRecipes.length === 0) return;

  const menuItemIds = [...new Set(affectedRecipes.map((r) => r.menuItemId))];

  // Load each affected menu item with its full recipe + current stock levels
  const menuItemsWithRecipes = await db.menuItem.findMany({
    where: { itemId: { in: menuItemIds } },
    include: {
      recipe: {
        include: {
          inventory: { select: { inventoryId: true, quantity: true } },
        },
      },
    },
  });

  for (const menuItem of menuItemsWithRecipes) {
    if (menuItem.recipe.length === 0) continue;

    // Unavailable if any single ingredient has quantity <= 0
    const hasOutOfStock = menuItem.recipe.some(
      (ri) => Number(ri.inventory.quantity) <= 0,
    );

    const shouldBeAvailable = !hasOutOfStock;

    // Only write if the flag actually needs to change (avoid unnecessary writes)
    if (menuItem.isAvailable !== shouldBeAvailable) {
      await db.menuItem.update({
        where: { itemId: menuItem.itemId },
        data: { isAvailable: shouldBeAvailable },
      });
    }
  }
};

module.exports = {
  DEDUCTION_TRIGGER_STATUSES,
  deductInventoryForOrder,
  restoreInventoryForCancelledOrder,
  syncMenuItemAvailability,
  createLowStockAlerts,
  createStockRestoredAlert,
};
