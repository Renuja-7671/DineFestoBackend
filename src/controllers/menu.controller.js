const prisma = require('../config/database');

// Get all menu items with optional category filter
exports.getAllMenuItems = async (req, res) => {
  try {
    const { categoryId, isAvailable } = req.query;
    
    const where = {};
    if (categoryId) where.categoryId = parseInt(categoryId);
    if (isAvailable !== undefined) where.isAvailable = isAvailable === 'true';

    const menuItems = await prisma.menuItem.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Map itemId to id for frontend consistency
    const mappedMenuItems = menuItems.map(item => ({
      ...item,
      id: item.itemId,
    }));

    res.json({
      success: true,
      data: mappedMenuItems,
    });
  } catch (error) {
    console.error('Error fetching menu items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch menu items',
      error: error.message,
    });
  }
};

// Get single menu item by ID
exports.getMenuItemById = async (req, res) => {
  try {
    const { id } = req.params;

    const menuItem = await prisma.menuItem.findUnique({
      where: { itemId: parseInt(id) },
      include: {
        category: true,
      },
    });

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found',
      });
    }

    // Map itemId to id for frontend consistency
    const mappedMenuItem = {
      ...menuItem,
      id: menuItem.itemId,
    };

    res.json({
      success: true,
      data: mappedMenuItem,
    });
  } catch (error) {
    console.error('Error fetching menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch menu item',
      error: error.message,
    });
  }
};

// Get all categories
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { menuItems: true },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message,
    });
  }
};

// Create new menu item
exports.createMenuItem = async (req, res) => {
  try {
    const { categoryId, name, description, price, imageUrl, isAvailable } = req.body;

    // Validate required fields
    if (!categoryId || !name || !price) {
      return res.status(400).json({
        success: false,
        message: 'Category, name, and price are required',
      });
    }

    const menuItem = await prisma.menuItem.create({
      data: {
        categoryId: parseInt(categoryId),
        name,
        description,
        price: parseFloat(price),
        imageUrl,
        isAvailable: isAvailable !== undefined ? isAvailable : true,
      },
      include: {
        category: true,
      },
    });

    // Map itemId to id for frontend consistency
    const mappedMenuItem = {
      ...menuItem,
      id: menuItem.itemId,
    };

    res.status(201).json({
      success: true,
      message: 'Menu item created successfully',
      data: mappedMenuItem,
    });
  } catch (error) {
    console.error('Error creating menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create menu item',
      error: error.message,
    });
  }
};

// Update menu item
exports.updateMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, name, description, price, imageUrl, isAvailable } = req.body;

    // Check if menu item exists
    const existingItem = await prisma.menuItem.findUnique({
      where: { itemId: parseInt(id) },
    });

    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found',
      });
    }

    const updateData = {};
    if (categoryId !== undefined) updateData.categoryId = parseInt(categoryId);
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (isAvailable !== undefined) updateData.isAvailable = isAvailable;

    const menuItem = await prisma.menuItem.update({
      where: { itemId: parseInt(id) },
      data: updateData,
      include: {
        category: true,
      },
    });

    // Map itemId to id for frontend consistency
    const mappedMenuItem = {
      ...menuItem,
      id: menuItem.itemId,
    };

    res.json({
      success: true,
      message: 'Menu item updated successfully',
      data: mappedMenuItem,
    });
  } catch (error) {
    console.error('Error updating menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update menu item',
      error: error.message,
    });
  }
};

// Delete menu item
exports.deleteMenuItem = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if menu item exists
    const existingItem = await prisma.menuItem.findUnique({
      where: { itemId: parseInt(id) },
    });

    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found',
      });
    }

    await prisma.menuItem.delete({
      where: { itemId: parseInt(id) },
    });

    res.json({
      success: true,
      message: 'Menu item deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete menu item',
      error: error.message,
    });
  }
};

// Create category
exports.createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required',
      });
    }

    const category = await prisma.category.create({
      data: {
        name,
        description,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category,
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create category',
      error: error.message,
    });
  }
};
