const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Customizable script to add orders for any customer
 * Usage: node scripts/addCustomOrder.js
 */

// ============================================
// CUSTOMIZE YOUR ORDER HERE
// ============================================

const ORDER_CONFIG = {
  customerId: 134,
  orderType: 'DINE_IN', // DINE_IN or TAKEAWAY
  orderStatus: 'PENDING', // PENDING, PREPARING, READY, SERVED, COMPLETED, CANCELLED
  tableNumber: 7, // null for takeaway/delivery
  
  // Define your order items (use menu item IDs)
  // You can add as many items as you want
  items: [
    {
      menuItemId: null, // Will be auto-filled with first available item
      quantity: 2,
      customization: null
    },
    {
      menuItemId: null, // Will be auto-filled with second available item
      quantity: 1,
      customization: 'Extra spicy, no onions'
    },
    {
      menuItemId: null, // Will be auto-filled with third available item
      quantity: 3,
      customization: null
    }
  ]
};

// ============================================
// SCRIPT - DO NOT MODIFY BELOW
// ============================================

async function addCustomOrder() {
  try {
    console.log('🍽️  Creating custom order...\n');

    // Verify customer exists
    const customer = await prisma.customer.findUnique({
      where: { customerId: ORDER_CONFIG.customerId },
      include: { user: { select: { email: true } } }
    });

    if (!customer) {
      console.log(`❌ Customer ID ${ORDER_CONFIG.customerId} not found!`);
      return;
    }

    console.log(`✅ Customer: ${customer.fullName} (${customer.user.email})`);

    // Get available menu items
    const menuItems = await prisma.menuItem.findMany({
      where: { isAvailable: true },
      take: 10
    });

    if (menuItems.length === 0) {
      console.log('❌ No menu items available!');
      return;
    }

    // Get a staff member
    const staff = await prisma.employee.findFirst();

    // Prepare order items with menu item IDs
    const orderItems = [];
    let totalAmount = 0;

    console.log('\n📋 Order Items:');
    for (let i = 0; i < ORDER_CONFIG.items.length; i++) {
      const itemConfig = ORDER_CONFIG.items[i];
      const menuItemId = itemConfig.menuItemId || menuItems[i]?.itemId;
      
      if (!menuItemId) {
        console.log(`⚠️  Skipping item ${i + 1} - no menu item available`);
        continue;
      }

      const menuItem = await prisma.menuItem.findUnique({
        where: { itemId: menuItemId }
      });

      if (!menuItem) {
        console.log(`⚠️  Skipping item ${i + 1} - menu item ${menuItemId} not found`);
        continue;
      }

      const itemTotal = parseFloat(menuItem.price) * itemConfig.quantity;
      totalAmount += itemTotal;

      orderItems.push({
        menuItemId: menuItemId,
        quantity: itemConfig.quantity,
        unitPrice: menuItem.price,
        customization: itemConfig.customization
      });

      console.log(`   ${i + 1}. ${menuItem.name} x${itemConfig.quantity} = LKR ${itemTotal.toFixed(2)}`);
      if (itemConfig.customization) {
        console.log(`      📝 ${itemConfig.customization}`);
      }
    }

    if (orderItems.length === 0) {
      console.log('\n❌ No valid order items to create!');
      return;
    }

    console.log(`\n💰 Total Amount: LKR ${totalAmount.toFixed(2)}`);

    // Create the order
    const order = await prisma.order.create({
      data: {
        customerId: ORDER_CONFIG.customerId,
        staffId: staff?.employeeId,
        status: ORDER_CONFIG.orderStatus,
        type: ORDER_CONFIG.orderType,
        tableNumber: ORDER_CONFIG.tableNumber,
        totalAmount: totalAmount,
        items: {
          create: orderItems
        }
      },
      include: {
        items: {
          include: {
            menuItem: true
          }
        }
      }
    });

    console.log('\n✅ Order created successfully!');
    console.log(`\n📦 Order Summary:`);
    console.log(`   Order ID: #${order.orderId}`);
    console.log(`   Customer: ${customer.fullName}`);
    console.log(`   Type: ${order.type}`);
    console.log(`   Status: ${order.status}`);
    if (order.tableNumber) {
      console.log(`   Table: ${order.tableNumber}`);
    }
    console.log(`   Items: ${order.items.length}`);
    console.log(`   Total: LKR ${order.totalAmount}`);
    console.log(`   Created: ${order.createdAt.toLocaleString()}`);

    console.log('\n🎉 Done! Customer can see this order in the mobile app now.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nFull error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
addCustomOrder();
