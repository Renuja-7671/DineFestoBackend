const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedOrders() {
  try {
    console.log('🌱 Starting to seed orders...\n');

    // 1. Get all available menu items with their current prices
    const menuItems = await prisma.menuItem.findMany({
      where: { isAvailable: true },
      select: {
        itemId: true,
        name: true,
        price: true,
        categoryId: true,
      },
    });

    if (menuItems.length === 0) {
      console.log('❌ No menu items found. Please add menu items first.');
      return;
    }

    console.log(`✅ Found ${menuItems.length} available menu items\n`);

    // 2. Get or create customers
    let customers = await prisma.customer.findMany({
      select: {
        customerId: true,
        fullName: true,
      },
    });

    // If no customers exist, create some sample ones
    if (customers.length === 0) {
      console.log('Creating sample customers...\n');
      
      const sampleCustomers = [
        { email: 'john.doe@example.com', fullName: 'John Doe', phoneNumber: '+94771234567' },
        { email: 'jane.smith@example.com', fullName: 'Jane Smith', phoneNumber: '+94772345678' },
        { email: 'mike.wilson@example.com', fullName: 'Mike Wilson', phoneNumber: '+94773456789' },
        { email: 'sarah.johnson@example.com', fullName: 'Sarah Johnson', phoneNumber: '+94774567890' },
        { email: 'david.brown@example.com', fullName: 'David Brown', phoneNumber: '+94775678901' },
      ];

      for (const customer of sampleCustomers) {
        const user = await prisma.user.create({
          data: {
            email: customer.email,
            passwordHash: '$2b$10$dummyHashForSeeding1234567890123456', // Dummy hash
            role: 'CUSTOMER',
          },
        });

        const createdCustomer = await prisma.customer.create({
          data: {
            userId: user.userId,
            fullName: customer.fullName,
            phoneNumber: customer.phoneNumber,
          },
        });

        customers.push({
          customerId: createdCustomer.customerId,
          fullName: createdCustomer.fullName,
        });
      }

      console.log(`✅ Created ${customers.length} sample customers\n`);
    } else {
      console.log(`✅ Found ${customers.length} existing customers\n`);
    }

    // 3. Get staff members (optional - can be null)
    const staff = await prisma.employee.findMany({
      select: {
        employeeId: true,
        fullName: true,
      },
    });

    // 4. Generate sample orders
    const orderTypes = ['DINE_IN', 'TAKEAWAY'];
    const orderStatuses = ['PENDING', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'];
    const numberOfOrders = 15; // Create 15 sample orders

    console.log(`📦 Creating ${numberOfOrders} sample orders...\n`);

    for (let i = 0; i < numberOfOrders; i++) {
      // Randomly select a customer
      const customer = customers[Math.floor(Math.random() * customers.length)];
      
      // Randomly select a staff member (if available)
      const staffMember = staff.length > 0 ? staff[Math.floor(Math.random() * staff.length)] : null;
      
      // Randomly select order type and status
      const orderType = orderTypes[Math.floor(Math.random() * orderTypes.length)];
      const orderStatus = orderStatuses[Math.floor(Math.random() * orderStatuses.length)];
      
      // Randomly select 1-5 menu items for this order
      const numberOfItems = Math.floor(Math.random() * 5) + 1;
      const orderItems = [];
      let totalAmount = 0;

      for (let j = 0; j < numberOfItems; j++) {
        const menuItem = menuItems[Math.floor(Math.random() * menuItems.length)];
        const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 quantity
        const itemTotal = parseFloat(menuItem.price) * quantity;
        totalAmount += itemTotal;

        orderItems.push({
          menuItemId: menuItem.itemId,
          quantity: quantity,
          unitPrice: menuItem.price,
          customization: Math.random() > 0.7 ? 'Extra spicy' : null, // 30% chance of customization
        });
      }

      // Create the order with items
      const order = await prisma.order.create({
        data: {
          customerId: customer.customerId,
          staffId: staffMember?.employeeId || null,
          status: orderStatus,
          type: orderType,
          tableNumber: orderType === 'DINE_IN' ? Math.floor(Math.random() * 20) + 1 : null,
          totalAmount: totalAmount,
          createdAt: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)), // Random date within last 7 days
          items: {
            create: orderItems,
          },
        },
        include: {
          items: {
            include: {
              menuItem: true,
            },
          },
          customer: true,
        },
      });

      console.log(`✅ Order ${i + 1}/${numberOfOrders} created:`);
      console.log(`   - Order ID: ${order.orderId}`);
      console.log(`   - Customer: ${order.customer.fullName}`);
      console.log(`   - Type: ${order.type}`);
      console.log(`   - Status: ${order.status}`);
      console.log(`   - Total: LKR ${totalAmount.toFixed(2)}`);
      console.log(`   - Items: ${order.items.length} items`);
      order.items.forEach(item => {
        console.log(`     • ${item.quantity}x ${item.menuItem.name} @ LKR ${item.unitPrice}`);
      });
      console.log('');
    }

    console.log('🎉 Successfully seeded all orders!\n');
    console.log('📊 Summary:');
    console.log(`   - Customers: ${customers.length}`);
    console.log(`   - Menu Items: ${menuItems.length}`);
    console.log(`   - Orders Created: ${numberOfOrders}`);
    
  } catch (error) {
    console.error('❌ Error seeding orders:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedOrders()
  .then(() => {
    console.log('\n✅ Seeding completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  });
