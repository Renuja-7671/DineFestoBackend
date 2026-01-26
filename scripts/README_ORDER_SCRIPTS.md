# Order Creation Scripts

Simple utility scripts to add orders for testing purposes.

## 📁 Files

### 1. `addOrderForCustomer.js` - Quick Order Creation
Simple script that creates a basic order for customer ID 134 with 2-3 menu items.

**Usage:**
```bash
cd /Users/renuja/Documents/Projects/RMS/backend
node scripts/addOrderForCustomer.js
```

**What it does:**
- Verifies customer ID 134 exists
- Picks 2 available menu items
- Creates a DINE_IN order at Table 7
- Status: PENDING
- Total calculated automatically

---

### 2. `addCustomOrder.js` - Customizable Order Creation
Advanced script where you can customize all order details.

**Usage:**
```bash
cd /Users/renuja/Documents/Projects/RMS/backend
node scripts/addCustomOrder.js
```

**Customization:**
Edit the `ORDER_CONFIG` section in the file:

```javascript
const ORDER_CONFIG = {
  customerId: 134,               // Customer ID
  orderType: 'DINE_IN',          // DINE_IN, TAKEAWAY, ONLINE_DELIVERY
  orderStatus: 'PENDING',        // PENDING, PREPARING, READY, etc.
  tableNumber: 7,                // null for takeaway/delivery
  
  items: [
    {
      menuItemId: null,          // Auto-picks menu item
      quantity: 2,
      customization: null
    },
    {
      menuItemId: 5,             // Specific menu item ID
      quantity: 1,
      customization: 'Extra spicy, no onions'
    }
  ]
};
```

---

## 🎯 Common Use Cases

### Test Case 1: Customer Just Registered
Customer ID 134 just registered, create their first order:
```bash
node scripts/addOrderForCustomer.js
```

### Test Case 2: Create Takeaway Order
Edit `addCustomOrder.js`:
```javascript
const ORDER_CONFIG = {
  customerId: 134,
  orderType: 'TAKEAWAY',
  orderStatus: 'PENDING',
  tableNumber: null,
  items: [
    { menuItemId: null, quantity: 5, customization: null }
  ]
};
```
Then run: `node scripts/addCustomOrder.js`

### Test Case 3: Create Multiple Orders
Run the script multiple times to create multiple orders for testing.

---

## 📋 Order Status Options

- `PENDING` - Just placed, awaiting kitchen
- `PREPARING` - Kitchen is working on it
- `READY` - Ready for pickup/serving
- `SERVED` - Delivered to table (dine-in)
- `COMPLETED` - Fully complete and paid
- `CANCELLED` - Order cancelled

---

## 🍽️ Order Type Options

- `DINE_IN` - Customer eating at restaurant (requires tableNumber)
- `TAKEAWAY` - Customer picking up (tableNumber = null)
- `ONLINE_DELIVERY` - Delivery order (tableNumber = null)

---

## 🔍 Finding Menu Item IDs

### Option 1: Use Prisma Studio
```bash
npx prisma studio
```
Navigate to `MenuItem` table and copy item IDs.

### Option 2: Query in Terminal
```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.menuItem.findMany({ take: 10 })
  .then(items => {
    items.forEach(i => console.log(\`ID: \${i.itemId} - \${i.name} (LKR \${i.price})\`));
    prisma.\$disconnect();
  });
"
```

---

## ✅ Verification

After running the script, verify in the mobile app:

1. **Login as customer:**
   - Email: (check customer's email in database)
   - Password: `customer123`

2. **Check Orders tab:**
   - Should see the newly created order
   - Status badge should match
   - Items should be listed correctly

3. **Backend verification:**
   ```bash
   npx prisma studio
   ```
   - Navigate to `Order` table
   - Find the order by customer ID 134
   - Check order items in `OrderItem` table

---

## 🐛 Troubleshooting

### Error: "Customer ID 134 not found"
**Solution:** Customer doesn't exist. Check customer ID:
```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.customer.findMany({ orderBy: { customerId: 'desc' }, take: 5 })
  .then(customers => {
    customers.forEach(c => console.log(\`ID: \${c.customerId} - \${c.fullName}\`));
    prisma.\$disconnect();
  });
"
```

### Error: "No menu items found"
**Solution:** Run the seed script first:
```bash
npm run prisma:seed
```

### Error: Foreign key constraint
**Solution:** Make sure:
- Customer ID exists
- Menu item IDs exist
- Employee/staff records exist

---

## 💡 Pro Tips

1. **Create orders with different statuses** to test the Active/History tabs:
   ```javascript
   // Create PENDING order (shows in Active tab)
   orderStatus: 'PENDING'
   
   // Create COMPLETED order (shows in History tab)
   orderStatus: 'COMPLETED'
   ```

2. **Test order cancellation** by creating PENDING orders then canceling in the app

3. **Test different order types** to verify the UI icons display correctly

4. **Add customization notes** to test special instructions feature

---

## 🎨 Example: Complete Test Scenario

**Goal:** Test the full order flow for customer 134

```bash
# Step 1: Create pending order
# Edit addCustomOrder.js with orderStatus: 'PENDING'
node scripts/addCustomOrder.js

# Step 2: Open mobile app and verify order appears in Active tab

# Step 3: Create another order with status 'COMPLETED'
# Edit addCustomOrder.js with orderStatus: 'COMPLETED'
node scripts/addCustomOrder.js

# Step 4: Verify it appears in History tab

# Step 5: Test order detail view for both orders
```

---

## 📝 Quick Reference

```bash
# Navigate to backend
cd /Users/renuja/Documents/Projects/RMS/backend

# Run quick order creation
node scripts/addOrderForCustomer.js

# Run custom order creation
node scripts/addCustomOrder.js

# View database
npx prisma studio

# Check customer ID
node -e "const p=require('@prisma/client');new p.PrismaClient().customer.findUnique({where:{customerId:134}}).then(c=>console.log(c))"
```

---

**Created:** Jan 26, 2026  
**Purpose:** Testing order features in customer mobile app  
**Customer ID:** 134 (latest registered customer)
