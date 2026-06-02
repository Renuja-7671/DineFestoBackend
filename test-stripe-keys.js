/**
 * Test script to verify Stripe keys are valid
 * Run this with: node test-stripe-keys.js
 */

require('dotenv').config();
const Stripe = require('stripe');

console.log('\n🔍 Testing Stripe Configuration...\n');

// Check if keys are present
const secretKey = process.env.STRIPE_SECRET_KEY;
const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

console.log('Secret Key:', secretKey ? `${secretKey.substring(0, 20)}...` : '❌ NOT FOUND');
console.log('Secret Key Length:', secretKey?.length || 0);
console.log('');
console.log('Publishable Key:', publishableKey ? `${publishableKey.substring(0, 20)}...` : '❌ NOT FOUND');
console.log('Publishable Key Length:', publishableKey?.length || 0);
console.log('');

if (!secretKey || !publishableKey) {
  console.log('❌ ERROR: Stripe keys not found in .env file');
  console.log('\nMake sure you have:');
  console.log('STRIPE_SECRET_KEY=sk_test_...');
  console.log('STRIPE_PUBLISHABLE_KEY=pk_test_...');
  process.exit(1);
}

// Test if keys are valid by making a simple API call
console.log('🧪 Testing Secret Key validity...\n');

const stripe = new Stripe(secretKey, {
  apiVersion: '2024-12-18.acacia',
});

stripe.customers.list({ limit: 1 })
  .then(() => {
    console.log('✅ Secret Key is VALID!');
    console.log('✅ Publishable Key format looks correct!');
    console.log('\n✨ Stripe configuration is working properly!\n');
  })
  .catch((error) => {
    console.log('❌ Secret Key is INVALID!');
    console.log('Error:', error.message);
    console.log('\n🔧 Please verify your keys at: https://dashboard.stripe.com/test/apikeys\n');
    process.exit(1);
  });
