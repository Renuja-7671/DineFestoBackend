# Database Seed Script - Schema Alignment Changes

## Summary
Successfully updated `prisma/seed.js` to match the actual Prisma schema with all correct field names and data types.

## Key Changes Made

### 1. **User & Employee Models**
- ✅ Changed `password` → `passwordHash`
- ✅ Removed `name` and `phoneNumber` from User model (they belong to Customer/Employee profiles)
- ✅ Changed `position` → `designation` in Employee model
- ✅ Changed `hireDate` → `joinDate` in Employee model

### 2. **MenuItem Model**
- ✅ Changed `availability` → `isAvailable`

### 3. **InventoryItem Model**
- ✅ Changed `name` → `itemName`
- ✅ Removed `supplier` field (not in schema)
- ✅ Added required `costPerUnit` field with realistic pricing

### 4. **Order Model**
- ✅ Changed `employeeId` → `staffId`
- ✅ Changed `orderDate` → `createdAt`
- ✅ Fixed status enum: `DELIVERED` → `COMPLETED` and `SERVED`
- ✅ Added `type` field with OrderType enum (DINE_IN, TAKEAWAY, ONLINE_DELIVERY)
- ✅ Added `tableNumber` for dine-in orders

### 5. **OrderItem Model**
- ✅ Changed `itemId` → `menuItemId`
- ✅ Changed `price` → `unitPrice`

### 6. **Reservation Model**
- ✅ Changed `reservationDate` → `reservationTime`
- ✅ Changed `partySize` → `guestCount`
- ✅ Added required `tableNumber` field
- ✅ Removed `specialRequests` field (not in schema)

### 7. **Review Model**
- ✅ Removed `orderId` (reviews are for menu items, not orders)
- ✅ Reviews now correctly link to `menuItemId`
- ✅ Changed `reviewDate` → `createdAt`

### 8. **Notification Model**
- ✅ Removed `type` field (not in schema)
- ✅ Simplified to just message and isRead

### 9. **Data Deletion Order**
- ✅ Added all related tables in correct order to avoid foreign key constraints:
  - payment, orderItem, order, review, reservation, notification
  - userSettings, securityLog, systemSettings
  - recipeIngredient, menuItem, category, inventoryItem
  - leaveRequest, attendance, customer, employee, user

## Sri Lankan Data Features

### Names
- 40+ authentic Sri Lankan first names (Sinhala & Tamil)
- 20+ common Sri Lankan surnames
- Random name generation for all users

### Menu Items (24 dishes)
- **Rice Dishes**: Chicken Kottu, Cheese Kottu, Egg Kottu, Rice and Curry, Chicken/Seafood Fried Rice, Lamprais
- **Hoppers**: Plain Hoppers, Egg Hoppers, String Hoppers
- **Curries**: Pol Sambol, Dhal Curry, Parippu
- **Devilled**: Chicken Devilled
- **Seafood**: Fish Ambul Thiyal
- **Desserts**: Watalappan, Curd and Treacle, Kiri Bath
- **Beverages**: Wood Apple Juice, King Coconut Water, Ginger Beer, Faluda, Ceylon Tea, Lime Juice

### Inventory Items (20 ingredients)
- Rice, Chicken, Coconut, Vegetables (Onions, Tomatoes)
- Spices (Chili Powder, Curry Leaves, Cinnamon, Ginger, Garlic)
- Seafood (Prawns, Cuttlefish, Fish)
- Basics (Eggs, Flour, Lentils, Jaggery, Oil)
- Fruits (King Coconut, Wood Apples)

### Phone Numbers
- Sri Lankan format: `+947XXXXXXXX` (country code +94, mobile prefix 7)

## Seeded Data Statistics

- **Users**: 39 total
  - 1 Admin (admin@rms.lk)
  - 3 Managers (manager1-3@rms.lk)
  - 6 Waiters (waiter1-6@rms.lk)
  - 4 Chefs (chef1-4@rms.lk)
  - 25 Customers (customer1-25@example.lk)
  
- **Menu**: 24 authentic Sri Lankan dishes across 8 categories
- **Inventory**: 20 ingredients with realistic quantities and costs
- **Orders**: 60 orders spanning last 30 days with various statuses
- **Reservations**: 30 reservations (past and future) with realistic timing
- **Reviews**: ~30 reviews with ratings and Sri Lankan-themed comments
- **Notifications**: 20 notifications distributed among staff

## Test Credentials

All passwords follow the pattern: `{role}123`

- Admin: `admin@rms.lk` / `admin123`
- Managers: `manager1-3@rms.lk` / `manager123`
- Waiters: `waiter1-6@rms.lk` / `waiter123`
- Chefs: `chef1-4@rms.lk` / `chef123`
- Customers: `customer1-25@example.lk` / `customer123`

## Running the Seed

```bash
npm run prisma:seed
```

## Success Indicators

✅ No Prisma validation errors
✅ All foreign key relationships maintained
✅ Realistic data distribution (70% completed orders, 80% confirmed reservations)
✅ Sri Lankan cultural authenticity
✅ Comprehensive coverage of all main tables
