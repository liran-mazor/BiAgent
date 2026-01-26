import 'dotenv/config';
import { Pool } from 'pg';
import { faker } from '@faker-js/faker';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'agentiq',
  user: 'agentiq',
  password: 'agentiq123',
});

async function generateDailyData() {
  const client = await pool.connect();
  
  try {
    console.log('🌅 Generating daily data...');
    
    // Set target date to today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Generate 20-40 new orders for today
    const orderCount = faker.number.int({ min: 20, max: 40 });
    
    for (let i = 0; i < orderCount; i++) {
      // Random customer
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
    
    console.log(`✅ Generated ${orderCount} orders for ${today.toDateString()}`);
  } catch (error) {
    console.error('❌ Error generating daily data:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

generateDailyData();