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
  { name: 'Chicken Kottu', description: 'Chopped roti mixed with chicken, vegetables and spices', price: 850 },
  { name: 'Cheese Kottu', description: 'Cheesy roti kottu with vegetables', price: 750 },
  { name: 'Egg Kottu', description: 'Classic kottu with eggs and vegetables', price: 650 },
  { name: 'Rice and Curry', description: 'Traditional Sri Lankan rice with assorted curries', price: 550 },
  { name: 'Chicken Fried Rice', description: 'Wok-fried rice with chicken and vegetables', price: 700 },
  { name: 'Seafood Fried Rice', description: 'Fried rice with prawns, cuttlefish and fish', price: 950 },
  { name: 'Lamprais', description: 'Dutch Burgher dish with rice, meat curry wrapped in banana leaf', price: 800 },
  { name: 'Hoppers (Appa)', description: 'Bowl-shaped pancakes made from fermented rice flour', price: 50 },
  { name: 'Egg Hopper', description: 'Hopper with egg in the center', price: 80 },
  { name: 'String Hoppers', description: 'Steamed rice noodles served with curry', price: 400 },
  { name: 'Chicken Devilled', description: 'Spicy stir-fried chicken with peppers and onions', price: 900 },
  { name: 'Fish Ambul Thiyal', description: 'Sour fish curry from Southern Sri Lanka', price: 850 },
  { name: 'Pol Sambol', description: 'Spicy coconut relish', price: 150 },
  { name: 'Dhal Curry', description: 'Creamy red lentil curry', price: 250 },
  { name: 'Parippu (Dhal)', description: 'Traditional lentil curry', price: 200 },
  { name: 'Watalappan', description: 'Coconut custard pudding with jaggery and spices', price: 300 },
  { name: 'Curd and Treacle', description: 'Buffalo curd with palm treacle', price: 250 },
  { name: 'Kiri Bath', description: 'Milk rice, traditional celebratory dish', price: 100 },
  { name: 'Wood Apple Juice', description: 'Fresh wood apple juice', price: 200 },
  { name: 'King Coconut Water', description: 'Fresh king coconut water', price: 150 },
  { name: 'Ginger Beer', description: 'Traditional Sri Lankan ginger beer', price: 180 },
  { name: 'Faluda', description: 'Sweet drink with rose syrup, basil seeds and ice cream', price: 350 },
  { name: 'Ceylon Tea', description: 'Pure Ceylon black tea', price: 100 },
  { name: 'Lime Juice', description: 'Fresh lime juice', price: 150 }
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

  // Create Admin User
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@restaurant.com' },
    update: {},
    create: {
      email: 'admin@restaurant.com',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      employeeProfile: {
        create: {
          fullName: 'Admin User',
          designation: 'Restaurant Owner',
          salary: 100000,
        },
      },
    },
  });
  console.log('✅ Admin user created:', admin.email);

  // Create Manager
  const managerPasswordHash = await bcrypt.hash('manager123', 10);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@restaurant.com' },
    update: {},
    create: {
      email: 'manager@restaurant.com',
      passwordHash: managerPasswordHash,
      role: 'MANAGER',
      employeeProfile: {
        create: {
          fullName: 'John Manager',
          designation: 'Floor Manager',
          salary: 50000,
        },
      },
    },
  });
  console.log('✅ Manager created:', manager.email);

  // Create Waiter
  const waiterPasswordHash = await bcrypt.hash('waiter123', 10);
  const waiter = await prisma.user.upsert({
    where: { email: 'waiter@restaurant.com' },
    update: {},
    create: {
      email: 'waiter@restaurant.com',
      passwordHash: waiterPasswordHash,
      role: 'WAITER',
      employeeProfile: {
        create: {
          fullName: 'Sarah Waiter',
          designation: 'Senior Waiter',
          salary: 30000,
        },
      },
    },
  });
  console.log('✅ Waiter created:', waiter.email);

  // Create Chef
  const chefPasswordHash = await bcrypt.hash('chef123', 10);
  const chef = await prisma.user.upsert({
    where: { email: 'chef@restaurant.com' },
    update: {},
    create: {
      email: 'chef@restaurant.com',
      passwordHash: chefPasswordHash,
      role: 'CHEF',
      employeeProfile: {
        create: {
          fullName: 'Mike Chef',
          designation: 'Head Chef',
          salary: 60000,
        },
      },
    },
  });
  console.log('✅ Chef created:', chef.email);

  // Create Sample Customer
  const customerPasswordHash = await bcrypt.hash('customer123', 10);
  const customer = await prisma.user.upsert({
    where: { email: 'customer@example.com' },
    update: {},
    create: {
      email: 'customer@example.com',
      passwordHash: customerPasswordHash,
      role: 'CUSTOMER',
      customerProfile: {
        create: {
          fullName: 'Jane Customer',
          phoneNumber: '+1234567890',
          loyaltyPoints: 100,
        },
      },
    },
  });
  console.log('✅ Customer created:', customer.email);

  // Create Categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { name: 'Appetizers' },
      update: {},
      create: {
        name: 'Appetizers',
        description: 'Start your meal right',
      },
    }),
    prisma.category.upsert({
      where: { name: 'Main Course' },
      update: {},
      create: {
        name: 'Main Course',
        description: 'Our signature dishes',
      },
    }),
    prisma.category.upsert({
      where: { name: 'Desserts' },
      update: {},
      create: {
        name: 'Desserts',
        description: 'Sweet endings',
      },
    }),
    prisma.category.upsert({
      where: { name: 'Beverages' },
      update: {},
      create: {
        name: 'Beverages',
        description: 'Refreshing drinks',
      },
    }),
  ]);
  console.log('✅ Categories created:', categories.length);

  // Create Sample Menu Items
  const menuItems = await Promise.all([
    prisma.menuItem.create({
      data: {
        categoryId: categories[0].categoryId,
        name: 'Caesar Salad',
        description: 'Fresh romaine lettuce with caesar dressing',
        price: 8.99,
        imageUrl: 'https://images.unsplash.com/photo-1546793665-c74683f339c1',
        isAvailable: true,
      },
    }),
    prisma.menuItem.create({
      data: {
        categoryId: categories[1].categoryId,
        name: 'Grilled Salmon',
        description: 'Fresh Atlantic salmon with seasonal vegetables',
        price: 24.99,
        imageUrl: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288',
        isAvailable: true,
      },
    }),
    prisma.menuItem.create({
      data: {
        categoryId: categories[2].categoryId,
        name: 'Chocolate Cake',
        description: 'Rich chocolate cake with vanilla ice cream',
        price: 7.99,
        imageUrl: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587',
        isAvailable: true,
      },
    }),
    prisma.menuItem.create({
      data: {
        categoryId: categories[3].categoryId,
        name: 'Fresh Orange Juice',
        description: 'Freshly squeezed orange juice',
        price: 4.99,
        imageUrl: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba',
        isAvailable: true,
      },
    }),
  ]);
  console.log('✅ Menu items created:', menuItems.length);

  // Create Sample Inventory Items
  const inventoryItems = await Promise.all([
    prisma.inventoryItem.create({
      data: {
        itemName: 'Lettuce',
        quantity: 50,
        unit: 'kg',
        reorderLevel: 10,
        costPerUnit: 2.5,
      },
    }),
    prisma.inventoryItem.create({
      data: {
        itemName: 'Salmon Fillet',
        quantity: 30,
        unit: 'kg',
        reorderLevel: 5,
        costPerUnit: 15.0,
      },
    }),
    prisma.inventoryItem.create({
      data: {
        itemName: 'Chocolate',
        quantity: 20,
        unit: 'kg',
        reorderLevel: 5,
        costPerUnit: 8.0,
      },
    }),
    prisma.inventoryItem.create({
      data: {
        itemName: 'Oranges',
        quantity: 100,
        unit: 'kg',
        reorderLevel: 20,
        costPerUnit: 1.5,
      },
    }),
  ]);
  console.log('✅ Inventory items created:', inventoryItems.length);

  console.log('✅ Database seeding completed successfully!');
  console.log('\n📝 Test Credentials:');
  console.log('Admin: admin@restaurant.com / admin123');
  console.log('Manager: manager@restaurant.com / manager123');
  console.log('Waiter: waiter@restaurant.com / waiter123');
  console.log('Chef: chef@restaurant.com / chef123');
  console.log('Customer: customer@example.com / customer123');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
