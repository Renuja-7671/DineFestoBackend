const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Sri Lankan Names
const sriLankanFirstNames = [
  'Kasun', 'Nuwan', 'Chamara', 'Dilshan', 'Tharindu', 'Sanath', 'Mahela', 'Kumar',
  'Roshan', 'Amila', 'Dinesh', 'Buddhika', 'Chathura', 'Gayan', 'Isuru',
  'Lasith', 'Malinga', 'Niroshan', 'Praveen', 'Sachith', 'Thilina', 'Upul',
  'Nimali', 'Sanduni', 'Chathurika', 'Dilini', 'Eshani', 'Fathima', 'Geethika',
  'Hashini', 'Ishara', 'Janani', 'Kavindi', 'Lakmini', 'Madhavi', 'Nadeeka',
  'Oshadi', 'Priyanka', 'Rashmi', 'Samanthi', 'Thilini', 'Udari', 'Vindya'
];

const sriLankanLastNames = [
  'Fernando', 'Silva', 'Perera', 'De Silva', 'Jayawardena', 'Gunawardena', 'Wickramasinghe',
  'Ratnayake', 'Jayasuriya', 'Dissanayake', 'Amarasinghe', 'Wijesinghe', 'Kumara',
  'Rajapaksa', 'Mendis', 'Bandara', 'Karunaratne', 'Ranasinghe', 'Senanayake',
  'Weerasinghe', 'Abeysekara', 'Gunasekara', 'Liyanage', 'Rathnayake'
];

const sriLankanDishes = [
  { name: 'Chicken Kottu', description: 'Chopped roti mixed with chicken, vegetables and spices', price: 8.50, category: 'Rice Dishes' },
  { name: 'Cheese Kottu', description: 'Cheesy roti kottu with vegetables', price: 7.50, category: 'Rice Dishes' },
  { name: 'Egg Kottu', description: 'Classic kottu with eggs and vegetables', price: 6.50, category: 'Rice Dishes' },
  { name: 'Rice and Curry', description: 'Traditional Sri Lankan rice with assorted curries', price: 5.50, category: 'Rice Dishes' },
  { name: 'Chicken Fried Rice', description: 'Wok-fried rice with chicken and vegetables', price: 7.00, category: 'Rice Dishes' },
  { name: 'Seafood Fried Rice', description: 'Fried rice with prawns, cuttlefish and fish', price: 9.50, category: 'Rice Dishes' },
  { name: 'Lamprais', description: 'Dutch Burgher dish with rice, meat curry wrapped in banana leaf', price: 8.00, category: 'Rice Dishes' },
  { name: 'Hoppers (Appa)', description: 'Bowl-shaped pancakes made from fermented rice flour', price: 0.50, category: 'Hoppers' },
  { name: 'Egg Hopper', description: 'Hopper with egg in the center', price: 0.80, category: 'Hoppers' },
  { name: 'String Hoppers', description: 'Steamed rice noodles served with curry', price: 4.00, category: 'Hoppers' },
  { name: 'Chicken Devilled', description: 'Spicy stir-fried chicken with peppers and onions', price: 9.00, category: 'Devilled' },
  { name: 'Fish Ambul Thiyal', description: 'Sour fish curry from Southern Sri Lanka', price: 8.50, category: 'Seafood' },
  { name: 'Pol Sambol', description: 'Spicy coconut relish', price: 1.50, category: 'Curries' },
  { name: 'Dhal Curry', description: 'Creamy red lentil curry', price: 2.50, category: 'Curries' },
  { name: 'Parippu (Dhal)', description: 'Traditional lentil curry', price: 2.00, category: 'Curries' },
  { name: 'Watalappan', description: 'Coconut custard pudding with jaggery and spices', price: 3.00, category: 'Desserts' },
  { name: 'Curd and Treacle', description: 'Buffalo curd with palm treacle', price: 2.50, category: 'Desserts' },
  { name: 'Kiri Bath', description: 'Milk rice, traditional celebratory dish', price: 1.00, category: 'Appetizers' },
  { name: 'Wood Apple Juice', description: 'Fresh wood apple juice', price: 2.00, category: 'Beverages' },
  { name: 'King Coconut Water', description: 'Fresh king coconut water', price: 1.50, category: 'Beverages' },
  { name: 'Ginger Beer', description: 'Traditional Sri Lankan ginger beer', price: 1.80, category: 'Beverages' },
  { name: 'Faluda', description: 'Sweet drink with rose syrup, basil seeds and ice cream', price: 3.50, category: 'Beverages' },
  { name: 'Ceylon Tea', description: 'Pure Ceylon black tea', price: 1.00, category: 'Beverages' },
  { name: 'Lime Juice', description: 'Fresh lime juice', price: 1.50, category: 'Beverages' }
];

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomSriLankanName() {
  return `${getRandomElement(sriLankanFirstNames)} ${getRandomElement(sriLankanLastNames)}`;
}

function getRandomPhoneNumber() {
  return `+947${Math.floor(10000000 + Math.random() * 90000000)}`;
}

function getRandomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function main() {
  console.log('🌱 Starting comprehensive database seeding with Sri Lankan data...');

  // Clear existing data
  console.log('🗑️  Clearing existing data...');
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.review.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.userSettings.deleteMany();
  await prisma.securityLog.deleteMany();
  await prisma.systemSettings.deleteMany();
  await prisma.recipeIngredient.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();

  // Hash password
  const hashedPassword = await bcrypt.hash('admin123', 10);

  // Create Admin User
  console.log('👤 Creating admin user...');
  const admin = await prisma.user.create({
    data: {
      email: 'admin@rms.lk',
      passwordHash: hashedPassword,
      role: 'ADMIN',
    },
  });

  // Create admin employee profile
  await prisma.employee.create({
    data: {
      userId: admin.userId,
      fullName: 'Nuwan Perera',
      contact: '+94771234567',
      designation: 'Restaurant Owner',
      salary: 100000,
      joinDate: new Date('2019-01-01'),
    },
  });

  // Create Employees
  console.log('👥 Creating employees...');
  const managerPassword = await bcrypt.hash('manager123', 10);
  const waiterPassword = await bcrypt.hash('waiter123', 10);
  const chefPassword = await bcrypt.hash('chef123', 10);

  const employees = [];
  
  // Managers
  for (let i = 0; i < 3; i++) {
    const user = await prisma.user.create({
      data: {
        email: `manager${i + 1}@rms.lk`,
        passwordHash: managerPassword,
        role: 'MANAGER',
      },
    });
    
    const employee = await prisma.employee.create({
      data: {
        userId: user.userId,
        fullName: getRandomSriLankanName(),
        contact: getRandomPhoneNumber(),
        designation: 'Floor Manager',
        salary: 75000 + (i * 5000),
        joinDate: getRandomDate(new Date(2020, 0, 1), new Date(2023, 0, 1)),
      },
    });
    employees.push(employee);
  }

  // Waiters
  for (let i = 0; i < 6; i++) {
    const user = await prisma.user.create({
      data: {
        email: `waiter${i + 1}@rms.lk`,
        passwordHash: waiterPassword,
        role: 'WAITER',
      },
    });
    
    const employee = await prisma.employee.create({
      data: {
        userId: user.userId,
        fullName: getRandomSriLankanName(),
        contact: getRandomPhoneNumber(),
        designation: i < 2 ? 'Senior Waiter' : 'Waiter',
        salary: 35000 + (i * 2000),
        joinDate: getRandomDate(new Date(2021, 0, 1), new Date(2024, 0, 1)),
      },
    });
    employees.push(employee);
  }

  // Chefs
  for (let i = 0; i < 4; i++) {
    const user = await prisma.user.create({
      data: {
        email: `chef${i + 1}@rms.lk`,
        passwordHash: chefPassword,
        role: 'CHEF',
      },
    });
    
    const employee = await prisma.employee.create({
      data: {
        userId: user.userId,
        fullName: getRandomSriLankanName(),
        contact: getRandomPhoneNumber(),
        designation: i === 0 ? 'Head Chef' : 'Chef',
        salary: 55000 + (i * 5000),
        joinDate: getRandomDate(new Date(2020, 6, 1), new Date(2023, 6, 1)),
      },
    });
    employees.push(employee);
  }

  // Create Customers
  console.log('🛍️  Creating customers...');
  const customerPassword = await bcrypt.hash('customer123', 10);
  const customers = [];

  for (let i = 0; i < 25; i++) {
    const user = await prisma.user.create({
      data: {
        email: `customer${i + 1}@example.lk`,
        passwordHash: customerPassword,
        role: 'CUSTOMER',
      },
    });

    const customer = await prisma.customer.create({
      data: {
        userId: user.userId,
        fullName: getRandomSriLankanName(),
        phoneNumber: getRandomPhoneNumber(),
        loyaltyPoints: Math.floor(Math.random() * 1000),
      },
    });
    customers.push(customer);
  }

  // Create Categories
  console.log('📁 Creating categories...');
  const categories = await Promise.all([
    prisma.category.create({ data: { name: 'Rice Dishes', description: 'Fried rice, kottu, and rice-based meals' } }),
    prisma.category.create({ data: { name: 'Curries', description: 'Traditional Sri Lankan curries' } }),
    prisma.category.create({ data: { name: 'Hoppers', description: 'Traditional breakfast items' } }),
    prisma.category.create({ data: { name: 'Devilled', description: 'Spicy stir-fried dishes' } }),
    prisma.category.create({ data: { name: 'Seafood', description: 'Fresh seafood dishes' } }),
    prisma.category.create({ data: { name: 'Desserts', description: 'Traditional Sri Lankan sweets' } }),
    prisma.category.create({ data: { name: 'Beverages', description: 'Drinks and refreshments' } }),
    prisma.category.create({ data: { name: 'Appetizers', description: 'Starters and side dishes' } }),
  ]);

  const categoryMap = {
    'Rice Dishes': categories[0].categoryId,
    'Curries': categories[1].categoryId,
    'Hoppers': categories[2].categoryId,
    'Devilled': categories[3].categoryId,
    'Seafood': categories[4].categoryId,
    'Desserts': categories[5].categoryId,
    'Beverages': categories[6].categoryId,
    'Appetizers': categories[7].categoryId,
  };

  // Create Menu Items
  console.log('🍽️  Creating menu items...');
  const menuItems = [];
  
  for (const dish of sriLankanDishes) {
    const item = await prisma.menuItem.create({
      data: {
        name: dish.name,
        description: dish.description,
        price: dish.price,
        categoryId: categoryMap[dish.category],
        isAvailable: Math.random() > 0.1,
        imageUrl: null,
      },
    });
    menuItems.push(item);
  }

  // Create Inventory Items
  console.log('📦 Creating inventory items...');
  const inventoryIngredients = [
    { itemName: 'Rice', quantity: 500, unit: 'kg', reorderLevel: 100, costPerUnit: 2.5 },
    { itemName: 'Chicken', quantity: 150, unit: 'kg', reorderLevel: 30, costPerUnit: 5.0 },
    { itemName: 'Coconut', quantity: 300, unit: 'units', reorderLevel: 50, costPerUnit: 0.5 },
    { itemName: 'Onions', quantity: 80, unit: 'kg', reorderLevel: 20, costPerUnit: 1.2 },
    { itemName: 'Tomatoes', quantity: 60, unit: 'kg', reorderLevel: 15, costPerUnit: 1.8 },
    { itemName: 'Chili Powder', quantity: 25, unit: 'kg', reorderLevel: 5, costPerUnit: 8.0 },
    { itemName: 'Curry Leaves', quantity: 10, unit: 'kg', reorderLevel: 2, costPerUnit: 3.5 },
    { itemName: 'Cinnamon', quantity: 15, unit: 'kg', reorderLevel: 3, costPerUnit: 12.0 },
    { itemName: 'Prawns', quantity: 40, unit: 'kg', reorderLevel: 10, costPerUnit: 15.0 },
    { itemName: 'Cuttlefish', quantity: 35, unit: 'kg', reorderLevel: 10, costPerUnit: 12.0 },
    { itemName: 'Fish', quantity: 50, unit: 'kg', reorderLevel: 15, costPerUnit: 8.0 },
    { itemName: 'Eggs', quantity: 500, unit: 'units', reorderLevel: 100, costPerUnit: 0.25 },
    { itemName: 'Flour', quantity: 200, unit: 'kg', reorderLevel: 40, costPerUnit: 1.5 },
    { itemName: 'Lentils (Dhal)', quantity: 100, unit: 'kg', reorderLevel: 20, costPerUnit: 2.0 },
    { itemName: 'Jaggery', quantity: 30, unit: 'kg', reorderLevel: 10, costPerUnit: 3.0 },
    { itemName: 'King Coconut', quantity: 200, unit: 'units', reorderLevel: 50, costPerUnit: 0.8 },
    { itemName: 'Wood Apples', quantity: 50, unit: 'kg', reorderLevel: 15, costPerUnit: 2.5 },
    { itemName: 'Ginger', quantity: 20, unit: 'kg', reorderLevel: 5, costPerUnit: 4.0 },
    { itemName: 'Garlic', quantity: 25, unit: 'kg', reorderLevel: 5, costPerUnit: 3.5 },
    { itemName: 'Oil', quantity: 100, unit: 'liters', reorderLevel: 25, costPerUnit: 3.0 },
  ];

  for (const ingredient of inventoryIngredients) {
    await prisma.inventoryItem.create({
      data: ingredient,
    });
  }

  // Create Orders with OrderItems
  console.log('📝 Creating orders...');
  const waiters = employees.filter(e => e.designation.includes('Waiter'));
  
  // Create 60 orders over the past 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  for (let i = 0; i < 60; i++) {
    const customer = getRandomElement(customers);
    const waiter = getRandomElement(waiters);
    const orderDate = getRandomDate(thirtyDaysAgo, now);
    
    // Use valid OrderStatus enum values
    let status;
    const rand = Math.random();
    if (rand < 0.70) status = 'COMPLETED';
    else if (rand < 0.80) status = 'SERVED';
    else if (rand < 0.88) status = 'READY';
    else if (rand < 0.94) status = 'PREPARING';
    else if (rand < 0.97) status = 'PENDING';
    else status = 'CANCELLED';

    // Determine order type
    const typeRand = Math.random();
    let orderType;
    if (typeRand < 0.65) orderType = 'DINE_IN';
    else orderType = 'TAKEAWAY';

    // Calculate order total
    const numItems = Math.floor(Math.random() * 4) + 1; // 1-4 items
    const orderMenuItems = [];
    let totalAmount = 0;

    for (let j = 0; j < numItems; j++) {
      const menuItem = getRandomElement(menuItems);
      const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 quantity
      orderMenuItems.push({ menuItem, quantity });
      totalAmount += parseFloat(menuItem.price) * quantity;
    }

    const order = await prisma.order.create({
      data: {
        customerId: customer.customerId,
        staffId: waiter.employeeId,
        status: status,
        type: orderType,
        tableNumber: orderType === 'DINE_IN' ? Math.floor(Math.random() * 20) + 1 : null,
        totalAmount: totalAmount,
        createdAt: orderDate,
      },
    });

    // Create order items
    for (const { menuItem, quantity } of orderMenuItems) {
      await prisma.orderItem.create({
        data: {
          orderId: order.orderId,
          menuItemId: menuItem.itemId,
          quantity: quantity,
          unitPrice: menuItem.price,
        },
      });
    }
  }

  // Create Reservations
  console.log('🪑 Creating reservations...');
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAhead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  for (let i = 0; i < 30; i++) {
    const customer = getRandomElement(customers);
    const reservationTime = getRandomDate(sevenDaysAgo, fourteenDaysAhead);
    
    // Set time to lunch (12-2pm) or dinner (7-9pm)
    const isLunch = Math.random() > 0.5;
    reservationTime.setHours(isLunch ? 12 + Math.floor(Math.random() * 2) : 19 + Math.floor(Math.random() * 2));
    reservationTime.setMinutes(Math.floor(Math.random() * 4) * 15); // 0, 15, 30, 45

    const isPast = reservationTime < now;
    let status;
    if (!isPast) {
      status = 'CONFIRMED';
    } else {
      const rand = Math.random();
      if (rand < 0.8) status = 'COMPLETED';
      else if (rand < 0.9) status = 'NO_SHOW';
      else status = 'CANCELLED';
    }

    await prisma.reservation.create({
      data: {
        customerId: customer.customerId,
        tableNumber: Math.floor(Math.random() * 20) + 1,
        reservationTime: reservationTime,
        guestCount: Math.floor(Math.random() * 7) + 2, // 2-8 people
        status: status,
      },
    });
  }

  // Create Reviews
  console.log('⭐ Creating reviews...');
  const completedOrders = await prisma.order.findMany({
    where: { status: 'COMPLETED' },
    include: { 
      customer: true,
      items: {
        include: {
          menuItem: true
        }
      }
    },
  });

  // Create reviews for 70% of completed orders
  const reviewComments = [
    'Excellent food and service!',
    'Authentic Sri Lankan taste, loved it!',
    'Good portion sizes and reasonable prices.',
    'The kottu was amazing!',
    'Best hoppers in town!',
    'Quick service and delicious food.',
    'Highly recommended for Sri Lankan cuisine.',
    'The curry was a bit too spicy for me.',
    'Great ambiance and friendly staff.',
    'Will definitely come back again!',
  ];

  for (let i = 0; i < Math.floor(completedOrders.length * 0.7); i++) {
    const order = completedOrders[i];
    if (order.items.length === 0) continue;
    
    const randomOrderItem = getRandomElement(order.items);
    const rating = Math.random() < 0.7 ? (Math.random() < 0.6 ? 5 : 4) : (Math.random() < 0.5 ? 3 : 2);
    
    await prisma.review.create({
      data: {
        customerId: order.customerId,
        menuItemId: randomOrderItem.menuItemId,
        rating: rating,
        comment: getRandomElement(reviewComments),
        createdAt: new Date(order.createdAt.getTime() + Math.random() * 2 * 24 * 60 * 60 * 1000), // 0-2 days after order
      },
    });
  }

  // Create Notifications
  console.log('🔔 Creating notifications...');
  const notificationMessages = [
    'New order received - Table 5',
    'Order #1234 is ready for delivery',
    'New reservation for 6 people at 7:00 PM',
    'Reservation confirmed for tomorrow',
    'System maintenance scheduled for tonight',
    'Low stock alert: Rice running low',
    'New review posted for Chicken Kottu',
    'Weekly sales report is ready',
    'Employee shift schedule updated',
    'Payment received for Order #5678',
  ];

  const allUsers = [admin, ...employees.map(e => ({ userId: e.userId }))];
  
  for (let i = 0; i < 20; i++) {
    const user = getRandomElement(allUsers);
    
    await prisma.notification.create({
      data: {
        userId: user.userId,
        message: getRandomElement(notificationMessages),
        isRead: Math.random() > 0.4,
      },
    });
  }

  console.log('✅ Database seeded successfully!');
  console.log('\n📊 Summary:');
  console.log(`   - Admin: 1 (admin@rms.lk / admin123)`);
  console.log(`   - Managers: 3 (manager1-3@rms.lk / manager123)`);
  console.log(`   - Waiters: 6 (waiter1-6@rms.lk / waiter123)`);
  console.log(`   - Chefs: 4 (chef1-4@rms.lk / chef123)`);
  console.log(`   - Customers: 25 (customer1-25@example.lk / customer123)`);
  console.log(`   - Categories: 8`);
  console.log(`   - Menu Items: ${menuItems.length}`);
  console.log(`   - Inventory Items: ${inventoryIngredients.length}`);
  console.log(`   - Orders: 60 (with order items)`);
  console.log(`   - Reservations: 30`);
  console.log(`   - Reviews: ~${Math.floor(completedOrders.length * 0.7)}`);
  console.log(`   - Notifications: 20`);
  console.log('\n🇱🇰 All data uses Sri Lankan names and authentic dishes!\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
