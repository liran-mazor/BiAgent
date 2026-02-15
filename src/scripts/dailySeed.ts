import { pool } from '../database/pool';
import { faker } from '@faker-js/faker';

async function generateDailyData() {
  const client = await pool.connect();
  
  try {
    console.log('🌅 Generating daily data...');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Generate 20-40 new customers
    const customerCount = faker.number.int({ min: 20, max: 40 });
    console.log(`👥 Generating ${customerCount} new customers...`);
    
    for (let i = 0; i < customerCount; i++) {
      const customerTime = new Date(today);
      customerTime.setHours(faker.number.int({ min: 0, max: 23 }));
      customerTime.setMinutes(faker.number.int({ min: 0, max: 59 }));
      
      await client.query(
        'INSERT INTO customers (email, name, created_at) VALUES ($1, $2, $3)',
        [
          faker.internet.email().toLowerCase(),
          faker.person.fullName(),
          customerTime
        ]
      );
    }
    
    // Generate 20-40 new orders for today
    const orderCount = faker.number.int({ min: 20, max: 40 });
    console.log(`📦 Generating ${orderCount} new orders...`);
    
    for (let i = 0; i < orderCount; i++) {
      // Random customer (including newly created ones)
      const customerResult = await client.query(
        'SELECT id FROM customers ORDER BY RANDOM() LIMIT 1'
      );
      const customerId = customerResult.rows[0].id;
      
      // Create order for today
      const totalAmount = faker.number.float({ min: 20, max: 500, multipleOf: 0.01 });
      const status = faker.helpers.arrayElement(['completed', 'pending', 'cancelled']);
      
      const orderTime = new Date(today);
      orderTime.setHours(faker.number.int({ min: 0, max: 23 }));
      orderTime.setMinutes(faker.number.int({ min: 0, max: 59 }));
      
      const orderResult = await client.query(
        'INSERT INTO orders (customer_id, total_amount, status, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
        [customerId, totalAmount, status, orderTime]
      );
      
      const orderId = orderResult.rows[0].id;
      
      // Add 1-3 order items per order
      const itemCount = faker.number.int({ min: 1, max: 3 });
      for (let j = 0; j < itemCount; j++) {
        const productResult = await client.query(
          'SELECT id, price FROM products ORDER BY RANDOM() LIMIT 1'
        );
        const product = productResult.rows[0];
        const quantity = faker.number.int({ min: 1, max: 5 });
        
        await client.query(
          'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
          [orderId, product.id, quantity, product.price]
        );
      }
    }
    
    console.log(`✅ Generated ${customerCount} customers and ${orderCount} orders for ${today.toDateString()}`);
  } catch (error) {
    console.error('❌ Error generating daily data:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

generateDailyData();