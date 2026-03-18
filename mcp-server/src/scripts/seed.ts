import { faker } from '@faker-js/faker';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

// Generate a date within a specific month
function randomDateInMonth(year: number, month: number): Date {
  const now = new Date();
  const start = new Date(year, month, 1);
  let end = new Date(year, month + 1, 0); // last day of month

  // If this is the current month, cap at yesterday
  if (year === now.getFullYear() && month === now.getMonth()) {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    end = yesterday;
  }

  return faker.date.between({ from: start, to: end });
}

async function seed() {
  const client = await pool.connect();

  try {
    console.log('🌱 Seeding database...');

    // Clear existing data
    await client.query('DELETE FROM reviews');
    await client.query('DELETE FROM order_items');
    await client.query('DELETE FROM orders');
    await client.query('DELETE FROM products');
    await client.query('DELETE FROM customers');
    console.log('🧹 Cleared existing data');

    // Insert 1000 customers spread across the last 5 years
    const customers: { id: number; createdAt: Date }[] = [];
    const now = new Date();

    for (let i = 0; i < 1000; i++) {
      const createdAt = faker.date.between({
        from: new Date(now.getFullYear() - 5, now.getMonth(), 1),
        to: now
      });
      const result = await client.query(
        'INSERT INTO customers (email, name, created_at) VALUES ($1, $2, $3) RETURNING id',
        [faker.internet.email(), faker.person.fullName(), createdAt]
      );
      customers.push({ id: result.rows[0].id, createdAt });
    }
    console.log('✅ Customers created');

    // Insert 50 products
    const products: { id: number; price: number }[] = [];
    const categories = ['Electronics', 'Clothing', 'Home', 'Books', 'Sports'];
    for (let i = 0; i < 50; i++) {
      const price = parseFloat(faker.commerce.price({ min: 10, max: 1000 }));
      const result = await client.query(
        'INSERT INTO products (name, category, price) VALUES ($1, $2, $3) RETURNING id',
        [faker.commerce.productName(), faker.helpers.arrayElement(categories), price]
      );
      products.push({ id: result.rows[0].id, price });
    }
    console.log('✅ Products created');

    // Insert orders month by month for the last 5 years (60 months)
    // Simulate realistic growth: more orders in recent months
    const allOrderIds: number[] = [];
    const totalMonths = 5 * 12;

    console.log(`📅 Inserting orders for the last ${totalMonths} months`);
    for (let monthOffset = totalMonths - 1; monthOffset >= 0; monthOffset--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();

      // More orders in recent months (growth simulation)
      const baseOrders = 15;
      const growthFactor = (totalMonths - monthOffset) * 2;
      const ordersThisMonth = baseOrders + growthFactor + faker.number.int({ min: -5, max: 5 });

      for (let i = 0; i < ordersThisMonth; i++) {
        const customer = faker.helpers.arrayElement(customers);
        const createdAt = randomDateInMonth(year, month);
        const status = faker.helpers.weightedArrayElement([
          { weight: 70, value: 'completed' },
          { weight: 20, value: 'pending' },
          { weight: 10, value: 'cancelled' }
        ]);

        const orderResult = await client.query(
          'INSERT INTO orders (customer_id, total_amount, status, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
          [customer.id, 0, status, createdAt]
        );
        const orderId = orderResult.rows[0].id;
        allOrderIds.push(orderId);

        // Add 1-5 items per order
        let totalAmount = 0;
        const itemCount = faker.number.int({ min: 1, max: 5 });

        for (let j = 0; j < itemCount; j++) {
          const product = faker.helpers.arrayElement(products);
          const quantity = faker.number.int({ min: 1, max: 3 });
          const itemTotal = product.price * quantity;
          totalAmount += itemTotal;

          await client.query(
            'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
            [orderId, product.id, quantity, product.price]
          );
        }
        await client.query('UPDATE orders SET total_amount = $1 WHERE id = $2', [totalAmount, orderId]);
      }
    }
    console.log('✅ Orders & order items created');

    // Insert reviews
    for (let i = 0; i < 1500; i++) {
      await client.query(
        'INSERT INTO reviews (product_id, customer_id, rating, comment) VALUES ($1, $2, $3, $4)',
        [
          faker.helpers.arrayElement(products).id,
          faker.helpers.arrayElement(customers).id,
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
