#!/bin/bash

# Restaurant Management System - API Test Script
# This script tests the backend API endpoints

BASE_URL="http://localhost:5001"
API_URL="$BASE_URL/api"

echo "🧪 Testing Restaurant Management System API"
echo "=========================================="
echo ""

# Test 1: Health Check
echo "1. Testing Health Check..."
response=$(curl -s "$BASE_URL/health")
if [ $? -eq 0 ]; then
    echo "✅ Health check passed"
    echo "   Response: $response"
else
    echo "❌ Health check failed"
fi
echo ""

# Test 2: Register Customer
echo "2. Testing Customer Registration..."
register_response=$(curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "test123456",
    "fullName": "Test User",
    "phoneNumber": "+1234567890"
  }')

if [ $? -eq 0 ]; then
    echo "✅ Registration endpoint reachable"
    echo "   Response: $register_response"
else
    echo "❌ Registration failed"
fi
echo ""

# Test 3: Login Admin
echo "3. Testing Admin Login..."
login_response=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@restaurant.com",
    "password": "admin123"
  }')

if [ $? -eq 0 ]; then
    echo "✅ Login endpoint reachable"
    # Extract token (requires jq for proper parsing)
    echo "   Response: $login_response"
    
    # Try to extract token if jq is available
    if command -v jq &> /dev/null; then
        token=$(echo $login_response | jq -r '.data.token')
        echo ""
        echo "   Token: ${token:0:50}..."
        
        # Test 4: Get Profile
        echo ""
        echo "4. Testing Get Profile (with token)..."
        profile_response=$(curl -s "$API_URL/auth/profile" \
          -H "Authorization: Bearer $token")
        
        if [ $? -eq 0 ]; then
            echo "✅ Profile endpoint reachable"
            echo "   Response: $profile_response"
        else
            echo "❌ Profile fetch failed"
        fi
    fi
else
    echo "❌ Login failed"
fi

echo ""
echo "=========================================="
echo "✅ API Testing Complete!"
echo ""
echo "📝 Test Accounts:"
echo "   Admin: admin@restaurant.com / admin123"
echo "   Manager: manager@restaurant.com / manager123"
echo "   Waiter: waiter@restaurant.com / waiter123"
echo "   Chef: chef@restaurant.com / chef123"
echo "   Customer: customer@example.com / customer123"
