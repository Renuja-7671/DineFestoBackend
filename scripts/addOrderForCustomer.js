const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Simple script to add order for customer ID 80
 * Usage: node scripts/addOrderForCustomer.js
 */

async function addOrder() {
  try {
    console.log('🍽️  Adding order for customer ID 80...\n');

    // Check if customer exists
    const customer = await prisma.customer.findUnique({
      where: { customerId: 80 },
      include: {
        user: {
          select: {
            email: true
          }
        }
      }
    });

    if (!customer) {
      console.log('❌ Customer with ID 80 not found!');
      console.log('💡 Tip: Check the database or create this customer first.');
      return;
    }

    console.log(`✅ Found customer: ${customer.fullName} (${customer.user.email})\n`);

    // Get some available menu items
    const menuItems = await prisma.menuItem.findMany({
      where: { isAvailable: true },
      take: 5,
      select: {
        itemId: true,
        name: true,
        price: true,
      }
    });

    if (menuItems.length === 0) {
      console.log('❌ No menu items found! Please add menu items first.');
      return;
    }

    console.log('📋 Available menu items:');
    menuItems.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.name} - LKR ${item.price}`);
    });
    console.log('');

    // Get a random waiter (staff member)
    const waiter = await prisma.employee.findFirst({
      where: {
        designation: {
          contains: 'Waiter'
        }
      }
    });

    // Create order with 2-3 items
    const orderItems = [
      {
        menuItemId: menuItems[0].itemId,
        quantity: 2,
        unitPrice: menuItems[0].price,
        customization: null
      },
      {
        menuItemId: menuItems[1].itemId,
        quantity: 1,
        unitPrice: menuItems[1].price,
        customization: 'Extra spicy'
      }
    ];

    // Calculate total
    const totalAmount = orderItems.reduce((sum, item) => {
      return sum + (parseFloat(item.unitPrice) * item.quantity);
    }, 0);

    // Create the order
    const order = await prisma.order.create({
      data: {
        customerId: 80,
        staffId: waiter?.employeeId || null,
        status: 'PENDING',
        type: 'DINE_IN',
        tableNumber: 7,
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
        },
        customer: {
          select: {
            fullName: true
          }
        }
      }
    });

    console.log('✅ Order created successfully!\n');
    console.log('📦 Order Details:');
    console.log(`   Order ID: #${order.orderId}`);
    console.log(`   Customer: ${order.customer.fullName}`);
    console.log(`   Type: ${order.type}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Table: ${order.tableNumber}`);
    console.log(`   Total: LKR ${order.totalAmount}\n`);
    
    console.log('🛒 Order Items:');
    order.items.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.menuItem.name} x${item.quantity} - LKR ${parseFloat(item.unitPrice) * item.quantity}`);
      if (item.customization) {
        console.log(`      Note: ${item.customization}`);
      }
    });
    console.log('');

    console.log('🎉 Done! The customer can now see this order in the mobile app.');
    
  } catch (error) {
    console.error('❌ Error creating order:', error.message);
    if (error.code === 'P2003') {
      console.log('\n💡 This might be a foreign key constraint error.');
      console.log('   Make sure customer ID 80 exists in the database.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
addOrder();
