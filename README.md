# Restaurant Management System - Backend

A comprehensive backend API for managing restaurant operations including orders, inventory, employees, and customer management.

## 🚀 Features

- **User Management**: Admin, Manager, Waiter, Chef, and Customer roles
- **Authentication**: JWT-based authentication with role-based access control
- **Menu Management**: Categories, menu items, and pricing
- **Order Management**: Dine-in, takeaway, and online delivery orders
- **Inventory Tracking**: Stock management with low stock alerts
- **HR Management**: Employee attendance and leave requests
- **Reservations**: Table booking system
- **Reviews & Ratings**: Customer feedback system
- **Payments**: Multiple payment methods support

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **Authentication**: JWT & bcrypt
- **Validation**: express-validator

## 📋 Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- PostgreSQL database (Supabase account)

## 🔧 Installation

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   - Copy `.env.example` to `.env`
   - Update the database credentials (already configured for Supabase)
   - Update JWT secret for production

4. **Generate Prisma Client**:
   ```bash
   npm run prisma:generate
   ```

5. **Push database schema**:
   ```bash
   npm run prisma:push
   ```
   
   Or create a migration:
   ```bash
   npm run prisma:migrate
   ```

6. **Seed the database** (optional):
   ```bash
   npm run prisma:seed
   ```

## 🏃‍♂️ Running the Server

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

The server will start on `http://localhost:5000`

## 📚 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new customer
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile (Protected)
- `PUT /api/auth/password` - Update password (Protected)
- `POST /api/auth/employee` - Create employee (Admin only)

### Menu
- `GET /api/menu` - Get all menu items
- `GET /api/menu/:id` - Get menu item by ID
- `POST /api/menu` - Create menu item (Admin)
- `PUT /api/menu/:id` - Update menu item (Admin)
- `DELETE /api/menu/:id` - Delete menu item (Admin)

### Orders
- `GET /api/orders` - Get all orders
- `GET /api/orders/:id` - Get order by ID
- `POST /api/orders` - Create new order
- `PUT /api/orders/:id` - Update order status
- `DELETE /api/orders/:id` - Cancel order

### Inventory
- `GET /api/inventory` - Get all inventory items (Admin/Manager)
- `POST /api/inventory` - Add inventory item (Admin/Manager)
- `PUT /api/inventory/:id` - Update inventory (Admin/Manager)
- `DELETE /api/inventory/:id` - Delete inventory item (Admin/Manager)

### Employees
- `GET /api/employees` - Get all employees (Admin/Manager)
- `GET /api/employees/:id` - Get employee details
- `PUT /api/employees/:id` - Update employee (Admin)
- `DELETE /api/employees/:id` - Delete employee (Admin)

### Reservations
- `GET /api/reservations` - Get all reservations
- `POST /api/reservations` - Create reservation
- `PUT /api/reservations/:id` - Update reservation
- `DELETE /api/reservations/:id` - Cancel reservation

### Reviews
- `GET /api/reviews` - Get all reviews
- `POST /api/reviews` - Create review (Customer)
- `DELETE /api/reviews/:id` - Delete review

### Notifications
- `GET /api/notifications` - Get user notifications
- `PUT /api/notifications/:id/read` - Mark as read

### Payments
- `POST /api/payments` - Process payment
- `GET /api/payments/:id` - Get payment details

## 🔐 Authentication

Include JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## 👥 Default Seed Users

After running the seed script:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@restaurant.com | admin123 |
| Manager | manager@restaurant.com | manager123 |
| Waiter | waiter@restaurant.com | waiter123 |
| Chef | chef@restaurant.com | chef123 |
| Customer | customer@example.com | customer123 |

## 🗄️ Database Management

**Open Prisma Studio** (Database GUI):
```bash
npm run prisma:studio
```

**Reset database**:
```bash
npx prisma migrate reset
```

## 📁 Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── seed.js           # Seed data
├── src/
│   ├── config/
│   │   ├── database.js   # Prisma client setup
│   │   └── index.js      # App configuration
│   ├── controllers/      # Request handlers
│   ├── middleware/       # Auth & validation middleware
│   ├── routes/          # API routes
│   ├── utils/           # Helper functions
│   └── server.js        # Express app setup
├── .env                 # Environment variables
├── .env.example         # Environment template
└── package.json
```

## 🔒 Security Features

- Password hashing with bcrypt
- JWT token authentication
- Role-based access control
- Request validation
- Helmet.js security headers
- CORS configuration

## 🚧 Development

**Watch for file changes**:
```bash
npm run dev
```

**Check code health**:
```bash
# Format Prisma schema
npx prisma format

# Validate Prisma schema
npx prisma validate
```

## 📝 Environment Variables

```env
DATABASE_URL=              # Supabase connection pooling URL
DIRECT_URL=                # Direct database URL for migrations
PORT=5000                  # Server port
NODE_ENV=development       # Environment
JWT_SECRET=                # JWT secret key
JWT_EXPIRES_IN=7d          # Token expiration
CORS_ORIGIN=               # Allowed origins (comma-separated)
```

## 🤝 Contributing

1. Create a new branch for your feature
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## 📄 License

ISC

## 🆘 Support

For issues or questions, please create an issue in the repository.
# DineFestoBackend
