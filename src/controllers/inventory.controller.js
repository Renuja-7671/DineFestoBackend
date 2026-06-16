const prisma = require('../config/database');
const {
  createLowStockAlerts,
  createStockRestoredAlert,
  syncMenuItemAvailability,
} = require('../services/inventoryConsumption.service');

const parsePagination = (query) => {
  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);

  return { hasPagination, page, limit, skip: (page - 1) * limit };
};

const mapInventoryItem = (item) => ({
  inventoryId: item.inventoryId,
  itemName: item.itemName,
  quantity: parseFloat(item.quantity),
  unit: item.unit,
  reorderLevel: parseFloat(item.reorderLevel),
  costPerUnit: parseFloat(item.costPerUnit),
  lastUpdated: item.lastUpdated,
  menuItemsUsingCount: item.menuItemsUsingCount ?? item._count?.usedInRecipes ?? 0,
});

const buildInventorySearchWhere = (search) => {
  const trimmedSearch = search?.trim();
  if (!trimmedSearch) {
    return {};
  }

  return {
    itemName: {
      contains: trimmedSearch,
      mode: 'insensitive',
    },
  };
};

const fetchPaginatedLowStockItems = async ({ search, skip, limit }) => {
  const trimmedSearch = search?.trim();
  const searchPattern = trimmedSearch ? `%${trimmedSearch}%` : null;

  const [inventoryItems, countResult] = searchPattern
    ? await Promise.all([
        prisma.$queryRaw`
          SELECT
            i."inventoryId",
            i."itemName",
            i.quantity::float8 AS quantity,
            i.unit,
            i."reorderLevel"::float8 AS "reorderLevel",
            i."costPerUnit"::float8 AS "costPerUnit",
            i."lastUpdated",
            COUNT(r."recipeId")::int AS "menuItemsUsingCount"
          FROM "InventoryItem" i
          LEFT JOIN "RecipeIngredient" r ON r."inventoryId" = i."inventoryId"
          WHERE i.quantity <= i."reorderLevel"
            AND i."itemName" ILIKE ${searchPattern}
          GROUP BY i."inventoryId"
          ORDER BY i."itemName" ASC
          LIMIT ${limit} OFFSET ${skip}
        `,
        prisma.$queryRaw`
          SELECT COUNT(*)::int AS count
          FROM "InventoryItem"
          WHERE quantity <= "reorderLevel"
            AND "itemName" ILIKE ${searchPattern}
        `,
      ])
    : await Promise.all([
        prisma.$queryRaw`
          SELECT
            i."inventoryId",
            i."itemName",
            i.quantity::float8 AS quantity,
            i.unit,
            i."reorderLevel"::float8 AS "reorderLevel",
            i."costPerUnit"::float8 AS "costPerUnit",
            i."lastUpdated",
            COUNT(r."recipeId")::int AS "menuItemsUsingCount"
          FROM "InventoryItem" i
          LEFT JOIN "RecipeIngredient" r ON r."inventoryId" = i."inventoryId"
          WHERE i.quantity <= i."reorderLevel"
          GROUP BY i."inventoryId"
          ORDER BY i."itemName" ASC
          LIMIT ${limit} OFFSET ${skip}
        `,
        prisma.$queryRaw`
          SELECT COUNT(*)::int AS count
          FROM "InventoryItem"
          WHERE quantity <= "reorderLevel"
        `,
      ]);

  return {
    items: inventoryItems.map(mapInventoryItem),
    total: countResult[0]?.count ?? 0,
  };
};

// Get all inventory items
exports.getAllInventoryItems = async (req, res) => {
  try {
    const { lowStock, search } = req.query;
    const { hasPagination, page, limit, skip } = parsePagination(req.query);

    if (hasPagination) {
      if (lowStock === 'true') {
        const { items, total } = await fetchPaginatedLowStockItems({ search, skip, limit });

        return res.json({
          success: true,
          data: items,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 0,
          },
        });
      }

      const where = buildInventorySearchWhere(search);
      const [inventoryItems, total] = await Promise.all([
        prisma.inventoryItem.findMany({
          where,
          skip,
          take: limit,
          orderBy: { itemName: 'asc' },
          include: {
            _count: { select: { usedInRecipes: true } },
          },
        }),
        prisma.inventoryItem.count({ where }),
      ]);

      return res.json({
        success: true,
        data: inventoryItems.map(mapInventoryItem),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 0,
        },
      });
    }

    let inventoryItems;

    if (lowStock === 'true') {
      inventoryItems = await prisma.$queryRaw`
        SELECT
          "inventoryId",
          "itemName",
          quantity::float8        AS quantity,
          unit,
          "reorderLevel"::float8  AS "reorderLevel",
          "costPerUnit"::float8   AS "costPerUnit",
          "lastUpdated"
        FROM "InventoryItem"
        WHERE quantity <= "reorderLevel"
        ORDER BY "itemName" ASC
      `;
    } else {
      inventoryItems = await prisma.inventoryItem.findMany({
        orderBy: { itemName: 'asc' },
        include: {
          _count: { select: { usedInRecipes: true } },
        },
      });
    }

    res.json({
      success: true,
      data: inventoryItems.map(mapInventoryItem),
    });
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory items',
      error: error.message,
    });
  }
};

// Get single inventory item by ID
exports.getInventoryItemById = async (req, res) => {
  try {
    const { id } = req.params;

    const inventoryItem = await prisma.inventoryItem.findUnique({
      where: { inventoryId: parseInt(id) },
      include: {
        usedInRecipes: {
          include: {
            menuItem: true,
          },
        },
      },
    });

    if (!inventoryItem) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found',
      });
    }

    res.json({
      success: true,
      data: inventoryItem,
    });
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory item',
      error: error.message,
    });
  }
};

// Create new inventory item
exports.createInventoryItem = async (req, res) => {
  try {
    const { itemName, quantity, unit, reorderLevel, costPerUnit } = req.body;

    // Validate required fields
    if (!itemName || quantity === undefined || !unit || reorderLevel === undefined || costPerUnit === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Item name, quantity, unit, reorder level, and cost per unit are required',
      });
    }

    // Check if item already exists
    const existingItem = await prisma.inventoryItem.findUnique({
      where: { itemName },
    });

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: 'An inventory item with this name already exists',
      });
    }

    const inventoryItem = await prisma.inventoryItem.create({
      data: {
        itemName,
        quantity: parseFloat(quantity),
        unit,
        reorderLevel: parseFloat(reorderLevel),
        costPerUnit: parseFloat(costPerUnit),
      },
    });

    res.status(201).json({
      success: true,
      message: 'Inventory item created successfully',
      data: inventoryItem,
    });
  } catch (error) {
    console.error('Error creating inventory item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create inventory item',
      error: error.message,
    });
  }
};

// Update inventory item
exports.updateInventoryItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { itemName, quantity, unit, reorderLevel, costPerUnit } = req.body;

    // Check if inventory item exists
    const existingItem = await prisma.inventoryItem.findUnique({
      where: { inventoryId: parseInt(id) },
    });

    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found',
      });
    }

    // Check if item name is being changed and if it already exists
    if (itemName && itemName !== existingItem.itemName) {
      const nameExists = await prisma.inventoryItem.findUnique({
        where: { itemName },
      });

      if (nameExists) {
        return res.status(400).json({
          success: false,
          message: 'An inventory item with this name already exists',
        });
      }
    }

    const updateData = {};
    if (itemName !== undefined) updateData.itemName = itemName;
    if (quantity !== undefined) updateData.quantity = parseFloat(quantity);
    if (unit !== undefined) updateData.unit = unit;
    if (reorderLevel !== undefined) updateData.reorderLevel = parseFloat(reorderLevel);
    if (costPerUnit !== undefined) updateData.costPerUnit = parseFloat(costPerUnit);

    const inventoryItem = await prisma.inventoryItem.update({
      where: { inventoryId: parseInt(id) },
      data: updateData,
    });

    // Sync menu item availability when quantity is directly edited
    if (quantity !== undefined) {
      await syncMenuItemAvailability([parseInt(id)]);
    }

    res.json({
      success: true,
      message: 'Inventory item updated successfully',
      data: inventoryItem,
    });
  } catch (error) {
    console.error('Error updating inventory item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update inventory item',
      error: error.message,
    });
  }
};

// Delete inventory item
exports.deleteInventoryItem = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if inventory item exists
    const existingItem = await prisma.inventoryItem.findUnique({
      where: { inventoryId: parseInt(id) },
      include: {
        usedInRecipes: true,
      },
    });

    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found',
      });
    }

    // Check if item is used in any recipes
    if (existingItem.usedInRecipes.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete inventory item that is used in menu item recipes',
      });
    }

    await prisma.inventoryItem.delete({
      where: { inventoryId: parseInt(id) },
    });

    res.json({
      success: true,
      message: 'Inventory item deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete inventory item',
      error: error.message,
    });
  }
};

// Adjust inventory quantity (add or subtract stock)
exports.adjustInventoryQuantity = async (req, res) => {
  try {
    const { id } = req.params;
    const { adjustment, reason } = req.body;

    if (adjustment === undefined || adjustment === 0) {
      return res.status(400).json({
        success: false,
        message: 'Adjustment amount is required and cannot be zero',
      });
    }

    const existingItem = await prisma.inventoryItem.findUnique({
      where: { inventoryId: parseInt(id) },
    });

    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found',
      });
    }

    const newQuantity = parseFloat(existingItem.quantity) + parseFloat(adjustment);

    if (newQuantity < 0) {
      return res.status(400).json({
        success: false,
        message: 'Adjustment would result in negative stock',
      });
    }

    const inventoryItem = await prisma.$transaction(async (tx) => {
      const updatedItem = await tx.inventoryItem.update({
        where: { inventoryId: parseInt(id) },
        data: {
          quantity: newQuantity,
        },
      });

      await tx.inventoryLedger.create({
        data: {
          inventoryId: parseInt(id),
          movementType: adjustment > 0 ? 'STOCK_IN' : 'MANUAL_ADJUSTMENT',
          quantityChange: parseFloat(adjustment),
          note: reason || 'Manual inventory adjustment',
        },
      });

      // Fire low-stock or stock-restored notifications
      if (adjustment > 0) {
        await createStockRestoredAlert(tx, updatedItem);
      } else {
        await createLowStockAlerts(tx, updatedItem);
      }

      // Auto-toggle menu item availability based on new stock level
      await syncMenuItemAvailability([parseInt(id)], tx);

      return updatedItem;
    });

    res.json({
      success: true,
      message: `Inventory adjusted successfully. ${adjustment > 0 ? 'Added' : 'Removed'} ${Math.abs(adjustment)} ${existingItem.unit}`,
      data: inventoryItem,
    });
  } catch (error) {
    console.error('Error adjusting inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to adjust inventory',
      error: error.message,
    });
  }
};

// Get inventory movement ledger
exports.getInventoryLedger = async (req, res) => {
  try {
    const { inventoryId, orderId, movementType, limit = 100 } = req.query;

    const where = {};
    if (inventoryId) where.inventoryId = parseInt(inventoryId);
    if (orderId) where.referenceOrderId = parseInt(orderId);
    if (movementType) where.movementType = movementType;

    const entries = await prisma.inventoryLedger.findMany({
      where,
      include: {
        inventory: {
          select: {
            inventoryId: true,
            itemName: true,
            unit: true,
          },
        },
        referenceOrder: {
          select: {
            orderId: true,
            status: true,
            inventoryDeductedAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: Math.min(parseInt(limit, 10) || 100, 500),
    });

    res.json({
      success: true,
      data: entries,
    });
  } catch (error) {
    console.error('Error fetching inventory ledger:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory ledger',
      error: error.message,
    });
  }
};

// Get recipe by menu item id
exports.getRecipeByMenuItem = async (req, res) => {
  try {
    const { menuItemId } = req.params;

    const menuItem = await prisma.menuItem.findUnique({
      where: { itemId: parseInt(menuItemId, 10) },
      include: {
        recipe: {
          include: {
            inventory: true,
          },
          orderBy: {
            recipeId: 'asc',
          },
        },
      },
    });

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found',
      });
    }

    res.json({
      success: true,
      data: {
        menuItemId: menuItem.itemId,
        menuItemName: menuItem.name,
        recipe: menuItem.recipe,
      },
    });
  } catch (error) {
    console.error('Error fetching recipe:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recipe',
      error: error.message,
    });
  }
};

// Replace recipe for a menu item
exports.upsertMenuItemRecipe = async (req, res) => {
  try {
    const { menuItemId } = req.params;
    const { recipeItems } = req.body;

    if (!Array.isArray(recipeItems) || recipeItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'recipeItems must be a non-empty array',
      });
    }

    const parsedMenuItemId = parseInt(menuItemId, 10);
    const menuItem = await prisma.menuItem.findUnique({
      where: { itemId: parsedMenuItemId },
    });

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found',
      });
    }

    const normalizedRecipeItems = recipeItems.map((item) => ({
      inventoryId: parseInt(item.inventoryId, 10),
      quantityUsed: parseFloat(item.quantityUsed),
    }));

    const hasInvalidItems = normalizedRecipeItems.some(
      (item) => Number.isNaN(item.inventoryId) || Number.isNaN(item.quantityUsed) || item.quantityUsed <= 0,
    );

    if (hasInvalidItems) {
      return res.status(400).json({
        success: false,
        message: 'Each recipe item must include valid inventoryId and positive quantityUsed',
      });
    }

    const uniqueInventoryIds = [...new Set(normalizedRecipeItems.map((item) => item.inventoryId))];
    if (uniqueInventoryIds.length !== normalizedRecipeItems.length) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate inventory items are not allowed in a recipe',
      });
    }

    const inventoryItems = await prisma.inventoryItem.findMany({
      where: {
        inventoryId: {
          in: uniqueInventoryIds,
        },
      },
      select: {
        inventoryId: true,
      },
    });

    if (inventoryItems.length !== uniqueInventoryIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more inventory items do not exist',
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.recipeIngredient.deleteMany({
        where: { menuItemId: parsedMenuItemId },
      });

      await tx.recipeIngredient.createMany({
        data: normalizedRecipeItems.map((item) => ({
          menuItemId: parsedMenuItemId,
          inventoryId: item.inventoryId,
          quantityUsed: item.quantityUsed,
        })),
      });
    });

    const updatedRecipe = await prisma.recipeIngredient.findMany({
      where: { menuItemId: parsedMenuItemId },
      include: {
        inventory: true,
      },
      orderBy: {
        recipeId: 'asc',
      },
    });

    res.json({
      success: true,
      message: 'Recipe updated successfully',
      data: {
        menuItemId: parsedMenuItemId,
        menuItemName: menuItem.name,
        recipe: updatedRecipe,
      },
    });
  } catch (error) {
    console.error('Error updating recipe:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update recipe',
      error: error.message,
    });
  }
};

// Get inventory statistics
exports.getInventoryStats = async (req, res) => {
  try {
    const totalItems = await prisma.inventoryItem.count();

    // Get low stock items
    const lowStockItems = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "InventoryItem"
      WHERE quantity <= "reorderLevel"
    `;

    // Get total inventory value
    const inventoryValue = await prisma.$queryRaw`
      SELECT SUM(quantity * "costPerUnit") as "totalValue"
      FROM "InventoryItem"
    `;

    res.json({
      success: true,
      data: {
        totalItems,
        lowStockCount: parseInt(lowStockItems[0].count),
        totalValue: parseFloat(inventoryValue[0].totalValue || 0),
      },
    });
  } catch (error) {
    console.error('Error fetching inventory stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory statistics',
      error: error.message,
    });
  }
};
