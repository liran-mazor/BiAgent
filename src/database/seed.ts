import { faker } from '@faker-js/faker';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'agentiq',
  password: 'agentiq123',
  database: 'agentiq',
});

async function seed() {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Seeding database...');

    // Insert customers
    const customers: number[] = [];
    for (let i = 0; i < 100; i++) {
      const result = await client.query(
        'INSERT INTO customers (email, name) VALUES ($1, $2) RETURNING id',
        [faker.internet.email(), faker.person.fullName()]
      );
      customers.push(result.rows[0].id);
    }
    console.log('✅ Customers created');

    // Insert products
    const products: number[] = [];
    const categories = ['Electronics', 'Clothing', 'Home', 'Books', 'Sports'];
    for (let i = 0; i < 50; i++) {
      const result = await client.query(
        'INSERT INTO products (name, category, price) VALUES ($1, $2, $3) RETURNING id',
        [
          faker.commerce.productName(),
          faker.helpers.arrayElement(categories),
          parseFloat(faker.commerce.price({ min: 10, max: 1000 }))
        ]
      );
      products.push(result.rows[0].id);
    }
    console.log('✅ Products created');

    // Insert orders & order items
    for (let i = 0; i < 200; i++) {
      const customerId = faker.helpers.arrayElement(customers);
      const createdAt = faker.date.between({ 
        from: '2024-01-01', 
        to: '2025-01-01' 
      });
      
      const orderResult = await client.query(
        'INSERT INTO orders (customer_id, total_amount, status, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
        [customerId, 0, faker.helpers.arrayElement(['completed', 'pending', 'cancelled']), createdAt]
      );
      const orderId = orderResult.rows[0].id;

      // Add 1-5 items per order
      let totalAmount = 0;
      const itemCount = faker.number.int({ min: 1, max: 5 });
      
      for (let j = 0; j < itemCount; j++) {
        const productId = faker.helpers.arrayElement(products);
        const quantity = faker.number.int({ min: 1, max: 3 });
        const priceResult = await client.query('SELECT price FROM products WHERE id = $1', [productId]);
        const price = parseFloat(priceResult.rows[0].price);
        const itemTotal = price * quantity;
        totalAmount += itemTotal;

        await client.query(
          'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
          [orderId, productId, quantity, price]
        );
      }

      // Update order total
      await client.query('UPDATE orders SET total_amount = $1 WHERE id = $2', [totalAmount, orderId]);
    }
    console.log('✅ Orders & order items created');

    // Insert reviews
    for (let i = 0; i < 150; i++) {
      await client.query(
        'INSERT INTO reviews (product_id, customer_id, rating, comment) VALUES ($1, $2, $3, $4)',
        [
          faker.helpers.arrayElement(products),
          faker.helpers.arrayElement(customers),
          faker.number.int({ min: 1, max: 5 }),
          faker.lorem.sentence()
        ]
      );
    }
    console.log('✅ Reviews created');

    console.log('🎉 Seeding complete!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();