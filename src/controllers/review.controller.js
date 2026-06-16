const prisma = require('../config/database');

// Get all reviews with filters
exports.getAllReviews = async (req, res) => {
  try {
    const { rating, menuItemId, customerId, sortBy = 'createdAt', order = 'desc' } = req.query;

    const filters = {};

    // Filter by rating
    if (rating) {
      filters.rating = parseInt(rating);
    }

    // Filter by menu item
    if (menuItemId) {
      filters.menuItemId = parseInt(menuItemId);
    }

    // Filter by customer
    if (customerId) {
      filters.customerId = parseInt(customerId);
    }

    const reviews = await prisma.review.findMany({
      where: filters,
      include: {
        customer: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        },
        menuItem: {
          select: {
            itemId: true,
            name: true,
            imageUrl: true,
            price: true,
          },
        },
      },
      orderBy: {
        [sortBy]: order,
      },
    });

    res.status(200).json({
      success: true,
      data: reviews,
      count: reviews.length,
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews',
      error: error.message,
    });
  }
};

// Get review by ID
exports.getReviewById = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await prisma.review.findUnique({
      where: { reviewId: parseInt(id) },
      include: {
        customer: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        },
        menuItem: {
          select: {
            itemId: true,
            name: true,
            description: true,
            imageUrl: true,
            price: true,
          },
        },
      },
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (error) {
    console.error('Error fetching review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch review',
      error: error.message,
    });
  }
};

// Create a new review
exports.createReview = async (req, res) => {
  try {
    const { customerId, menuItemId, rating, comment } = req.body;

    // Validate required fields
    if (!customerId || !menuItemId || !rating) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID, menu item ID, and rating are required',
      });
    }

    // Validate rating range (1-5)
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5',
      });
    }

    // Check if customer exists
    const customerExists = await prisma.customer.findUnique({
      where: { customerId: parseInt(customerId) },
    });

    if (!customerExists) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    // Check if menu item exists
    const menuItemExists = await prisma.menuItem.findUnique({
      where: { itemId: parseInt(menuItemId) },
    });

    if (!menuItemExists) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found',
      });
    }

    // Check if customer has already reviewed this item
    const existingReview = await prisma.review.findFirst({
      where: {
        customerId: parseInt(customerId),
        menuItemId: parseInt(menuItemId),
      },
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this item. Please update your existing review.',
      });
    }

    const review = await prisma.review.create({
      data: {
        customerId: parseInt(customerId),
        menuItemId: parseInt(menuItemId),
        rating: parseInt(rating),
        comment: comment || null,
      },
      include: {
        customer: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        },
        menuItem: {
          select: {
            itemId: true,
            name: true,
            imageUrl: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      data: review,
    });
  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create review',
      error: error.message,
    });
  }
};

// Update a review
exports.updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

    // Check if review exists
    const existingReview = await prisma.review.findUnique({
      where: { reviewId: parseInt(id) },
    });

    if (!existingReview) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    // Validate rating if provided
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5',
      });
    }

    const updateData = {};
    if (rating) updateData.rating = parseInt(rating);
    if (comment !== undefined) updateData.comment = comment || null;

    const review = await prisma.review.update({
      where: { reviewId: parseInt(id) },
      data: updateData,
      include: {
        customer: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        },
        menuItem: {
          select: {
            itemId: true,
            name: true,
            imageUrl: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: 'Review updated successfully',
      data: review,
    });
  } catch (error) {
    console.error('Error updating review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update review',
      error: error.message,
    });
  }
};

// Delete a review
exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if review exists
    const existingReview = await prisma.review.findUnique({
      where: { reviewId: parseInt(id) },
    });

    if (!existingReview) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    await prisma.review.delete({
      where: { reviewId: parseInt(id) },
    });

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete review',
      error: error.message,
    });
  }
};

// Get review statistics
exports.getReviewStats = async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      totalReviews,
      ratingAggregate,
      ratingDistribution,
      recentReviews,
    ] = await Promise.all([
      prisma.review.count(),
      prisma.review.aggregate({ _avg: { rating: true } }),
      Promise.all([
        prisma.review.count({ where: { rating: 5 } }),
        prisma.review.count({ where: { rating: 4 } }),
        prisma.review.count({ where: { rating: 3 } }),
        prisma.review.count({ where: { rating: 2 } }),
        prisma.review.count({ where: { rating: 1 } }),
      ]),
      prisma.review.count({
        where: {
          createdAt: {
            gte: sevenDaysAgo,
          },
        },
      }),
    ]);

    const averageRating = ratingAggregate._avg.rating
      ? Number(ratingAggregate._avg.rating.toFixed(1))
      : 0;

    res.status(200).json({
      success: true,
      data: {
        totalReviews,
        averageRating: parseFloat(averageRating),
        recentReviews,
        ratingDistribution: {
          5: ratingDistribution[0],
          4: ratingDistribution[1],
          3: ratingDistribution[2],
          2: ratingDistribution[3],
          1: ratingDistribution[4],
        },
      },
    });
  } catch (error) {
    console.error('Error fetching review stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch review statistics',
      error: error.message,
    });
  }
};

// Get reviews for a specific menu item with stats
exports.getMenuItemReviews = async (req, res) => {
  try {
    const { menuItemId } = req.params;

    // Check if menu item exists
    const menuItem = await prisma.menuItem.findUnique({
      where: { itemId: parseInt(menuItemId) },
    });

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found',
      });
    }

    // Get all reviews for this menu item
    const reviews = await prisma.review.findMany({
      where: {
        menuItemId: parseInt(menuItemId),
      },
      include: {
        customer: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculate average rating for this item
    const averageRating = reviews.length > 0
      ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        menuItem: {
          itemId: menuItem.itemId,
          name: menuItem.name,
          imageUrl: menuItem.imageUrl,
        },
        reviews,
        totalReviews: reviews.length,
        averageRating: parseFloat(averageRating),
      },
    });
  } catch (error) {
    console.error('Error fetching menu item reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch menu item reviews',
      error: error.message,
    });
  }
};
