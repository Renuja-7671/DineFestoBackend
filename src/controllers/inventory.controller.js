const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all inventory items
exports.getAllInventoryItems = async (req, res) => {
  try {
    const { lowStock } = req.query;
    
    let where = {};
    
    // Filter for low stock items (quantity <= reorderLevel)
    if (lowStock === 'true') {
      where = {
        quantity: {
          lte: prisma.raw('reorderLevel')
        }
      };
      
      // Alternative approach using raw query
      const items = await prisma.$queryRaw`
        SELECT * FROM "InventoryItem"
        WHERE quantity <= "reorderLevel"
        ORDER BY "itemName" ASC
      `;
      
      return res.json({
        success: true,
        data: items,
      });
    }

    const inventoryItems = await prisma.inventoryItem.findMany({
      where,
      orderBy: {
        itemName: 'asc',
      },
    });

    res.json({
      success: true,
      data: inventoryItems,
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

    const inventoryItem = await prisma.inventoryItem.update({
      where: { inventoryId: parseInt(id) },
      data: {
        quantity: newQuantity,
      },
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
