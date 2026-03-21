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
    await client.query('DELETE FROM returns');
    await client.query('DELETE FROM reviews');
    await client.query('DELETE FROM order_items');
    await client.query('DELETE FROM orders');
    await client.query('DELETE FROM products');
    await client.query('DELETE FROM customers');
    await client.query('DELETE FROM monthly_targets');
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

    // ── Monthly targets ────────────────────────────────────────────────────────
    // Sourced directly from annual plan docs (docs/20XX-annual-plan.md).
    // Null orders_target for years/categories where the plan only had revenue figures.
    type MonthlyTarget = { year: number; month: number; category: string; revenue: number; orders: number | null };

    const monthlyTargets: MonthlyTarget[] = [
      // 2021 — Electronics and Clothing only (partial year, March launch)
      { year: 2021, month: 3,  category: 'Electronics', revenue: 18000, orders: 12 },
      { year: 2021, month: 4,  category: 'Electronics', revenue: 22000, orders: 14 },
      { year: 2021, month: 5,  category: 'Electronics', revenue: 24000, orders: null },
      { year: 2021, month: 5,  category: 'Clothing',    revenue: 8000,  orders: null },
      { year: 2021, month: 6,  category: 'Electronics', revenue: 26000, orders: null },
      { year: 2021, month: 6,  category: 'Clothing',    revenue: 12000, orders: null },
      { year: 2021, month: 7,  category: 'Electronics', revenue: 30000, orders: 26 },
      { year: 2021, month: 7,  category: 'Clothing',    revenue: 14000, orders: null },
      { year: 2021, month: 8,  category: 'Electronics', revenue: 32000, orders: 28 },
      { year: 2021, month: 8,  category: 'Clothing',    revenue: 16000, orders: null },
      { year: 2021, month: 9,  category: 'Electronics', revenue: 34000, orders: 29 },
      { year: 2021, month: 9,  category: 'Clothing',    revenue: 16000, orders: null },
      { year: 2021, month: 10, category: 'Electronics', revenue: 38000, orders: 32 },
      { year: 2021, month: 10, category: 'Clothing',    revenue: 18000, orders: null },
      { year: 2021, month: 11, category: 'Electronics', revenue: 62000, orders: 44 },
      { year: 2021, month: 11, category: 'Clothing',    revenue: 24000, orders: null },
      { year: 2021, month: 12, category: 'Electronics', revenue: 98000, orders: 62 },
      { year: 2021, month: 12, category: 'Clothing',    revenue: 28000, orders: null },

      // 2022 — Electronics, Clothing, Home (Apr+), Books (Jul+)
      { year: 2022, month: 1,  category: 'Electronics', revenue: 42000, orders: 30 },
      { year: 2022, month: 1,  category: 'Clothing',    revenue: 22000, orders: null },
      { year: 2022, month: 2,  category: 'Electronics', revenue: 46000, orders: 32 },
      { year: 2022, month: 2,  category: 'Clothing',    revenue: 24000, orders: null },
      { year: 2022, month: 3,  category: 'Electronics', revenue: 48000, orders: 34 },
      { year: 2022, month: 3,  category: 'Clothing',    revenue: 26000, orders: null },
      { year: 2022, month: 4,  category: 'Electronics', revenue: 52000, orders: 40 },
      { year: 2022, month: 4,  category: 'Clothing',    revenue: 28000, orders: null },
      { year: 2022, month: 4,  category: 'Home',        revenue: 18000, orders: null },
      { year: 2022, month: 5,  category: 'Electronics', revenue: 54000, orders: 42 },
      { year: 2022, month: 5,  category: 'Clothing',    revenue: 30000, orders: null },
      { year: 2022, month: 5,  category: 'Home',        revenue: 22000, orders: null },
      { year: 2022, month: 6,  category: 'Electronics', revenue: 52000, orders: 42 },
      { year: 2022, month: 6,  category: 'Clothing',    revenue: 32000, orders: null },
      { year: 2022, month: 6,  category: 'Home',        revenue: 24000, orders: null },
      { year: 2022, month: 7,  category: 'Electronics', revenue: 56000, orders: 46 },
      { year: 2022, month: 7,  category: 'Clothing',    revenue: 30000, orders: null },
      { year: 2022, month: 7,  category: 'Home',        revenue: 26000, orders: null },
      { year: 2022, month: 7,  category: 'Books',       revenue: 12000, orders: null },
      { year: 2022, month: 8,  category: 'Electronics', revenue: 58000, orders: 48 },
      { year: 2022, month: 8,  category: 'Clothing',    revenue: 32000, orders: null },
      { year: 2022, month: 8,  category: 'Home',        revenue: 28000, orders: null },
      { year: 2022, month: 8,  category: 'Books',       revenue: 16000, orders: null },
      { year: 2022, month: 9,  category: 'Electronics', revenue: 60000, orders: 48 },
      { year: 2022, month: 9,  category: 'Clothing',    revenue: 32000, orders: null },
      { year: 2022, month: 9,  category: 'Home',        revenue: 28000, orders: null },
      { year: 2022, month: 9,  category: 'Books',       revenue: 18000, orders: null },
      { year: 2022, month: 10, category: 'Electronics', revenue: 62000, orders: 50 },
      { year: 2022, month: 10, category: 'Clothing',    revenue: 34000, orders: null },
      { year: 2022, month: 10, category: 'Home',        revenue: 30000, orders: null },
      { year: 2022, month: 10, category: 'Books',       revenue: 20000, orders: null },
      { year: 2022, month: 11, category: 'Electronics', revenue: 98000, orders: 72 },
      { year: 2022, month: 11, category: 'Clothing',    revenue: 44000, orders: null },
      { year: 2022, month: 11, category: 'Home',        revenue: 34000, orders: null },
      { year: 2022, month: 11, category: 'Books',       revenue: 22000, orders: null },
      { year: 2022, month: 12, category: 'Electronics', revenue: 138000, orders: 92 },
      { year: 2022, month: 12, category: 'Clothing',    revenue: 48000, orders: null },
      { year: 2022, month: 12, category: 'Home',        revenue: 36000, orders: null },
      { year: 2022, month: 12, category: 'Books',       revenue: 24000, orders: null },

      // 2023 — all 5 categories (Sports from May)
      ...[1,2,3,4].flatMap(m => ([
        { year: 2023, month: m, category: 'Electronics', revenue: [62,66,68,70][m-1]*1000, orders: [52,54,56,58][m-1] },
        { year: 2023, month: m, category: 'Clothing',    revenue: [34,36,38,42][m-1]*1000, orders: null },
        { year: 2023, month: m, category: 'Home',        revenue: [22,24,28,30][m-1]*1000, orders: null },
        { year: 2023, month: m, category: 'Books',       revenue: [18,20,22,24][m-1]*1000, orders: null },
      ] as MonthlyTarget[])),
      ...[5,6,7,8,9,10,11,12].flatMap(m => {
        const idx = m - 5;
        return [
          { year: 2023, month: m, category: 'Electronics', revenue: [72,70,74,78,80,82,124,160][idx]*1000, orders: [62,62,64,66,66,66,88,106][idx] },
          { year: 2023, month: m, category: 'Clothing',    revenue: [44,44,42,44,44,46,56,60][idx]*1000, orders: null },
          { year: 2023, month: m, category: 'Home',        revenue: [32,34,36,36,36,36,40,42][idx]*1000, orders: null },
          { year: 2023, month: m, category: 'Books',       revenue: [26,26,28,28,30,30,32,36][idx]*1000, orders: null },
          { year: 2023, month: m, category: 'Sports',      revenue: [18,24,28,30,28,24,26,22][idx]*1000, orders: null },
        ] as MonthlyTarget[];
      }),

      // 2024 — all 5 categories
      ...[1,2,3,4,5,6,7,8,9,10,11,12].flatMap(m => {
        const idx = m - 1;
        return [
          { year: 2024, month: m, category: 'Electronics', revenue: [82,86,88,90,92,90,94,98,100,102,156,218][idx]*1000, orders: [80,84,86,90,92,90,94,98,98,100,136,180][idx] },
          { year: 2024, month: m, category: 'Clothing',    revenue: [48,50,54,56,58,58,56,58,60,62,76,84][idx]*1000, orders: null },
          { year: 2024, month: m, category: 'Home',        revenue: [32,34,36,40,44,46,48,50,50,50,52,54][idx]*1000, orders: null },
          { year: 2024, month: m, category: 'Books',       revenue: [40,44,46,52,54,56,58,60,60,62,66,62][idx]*1000, orders: null },
          { year: 2024, month: m, category: 'Sports',      revenue: [22,26,28,32,36,34,38,40,38,36,30,28][idx]*1000, orders: null },
        ] as MonthlyTarget[];
      }),

      // 2025 — all 5 categories
      ...[1,2,3,4,5,6,7,8,9,10,11,12].flatMap(m => {
        const idx = m - 1;
        return [
          { year: 2025, month: m, category: 'Electronics', revenue: [100,108,112,116,118,116,120,126,130,134,206,296][idx]*1000, orders: [105,112,121,130,136,138,131,140,148,152,178,210][idx] },
          { year: 2025, month: m, category: 'Clothing',    revenue: [56,60,64,70,74,74,70,72,74,78,100,108][idx]*1000, orders: null },
          { year: 2025, month: m, category: 'Home',        revenue: [36,40,44,52,58,62,60,62,62,62,64,66][idx]*1000, orders: null },
          { year: 2025, month: m, category: 'Books',       revenue: [52,58,62,68,72,74,76,78,80,82,88,90][idx]*1000, orders: null },
          { year: 2025, month: m, category: 'Sports',      revenue: [36,42,48,56,62,58,68,72,68,62,52,56][idx]*1000, orders: null },
        ] as MonthlyTarget[];
      }),

      // 2026 — all 5 categories (sourced from docs/2026-annual-plan.md)
      ...[1,2,3,4,5,6,7,8,9,10,11,12].flatMap(m => {
        const idx = m - 1;
        return [
          { year: 2026, month: m, category: 'Electronics', revenue: [115,122,132,140,148,144,154,162,168,172,264,374][idx]*1000, orders: null },
          { year: 2026, month: m, category: 'Clothing',    revenue: [64,68,74,82,88,88,84,86,88,94,124,140][idx]*1000, orders: null },
          { year: 2026, month: m, category: 'Home',        revenue: [42,46,50,62,72,78,76,78,78,78,82,88][idx]*1000, orders: null },
          { year: 2026, month: m, category: 'Books',       revenue: [66,72,76,84,90,90,96,98,102,104,112,120][idx]*1000, orders: null },
          { year: 2026, month: m, category: 'Sports',      revenue: [43,48,52,64,74,68,80,88,84,76,66,70][idx]*1000, orders: null },
        ] as MonthlyTarget[];
      }),
    ];

    for (const t of monthlyTargets) {
      await client.query(
        `INSERT INTO monthly_targets (year, month, category, revenue_target, orders_target)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (year, month, category) DO NOTHING`,
        [t.year, t.month, t.category, t.revenue, t.orders]
      );
    }
    console.log(`✅ Monthly targets created (${monthlyTargets.length} rows)`);

    // ── Returns ────────────────────────────────────────────────────────────────
    // Return rate and reason distribution per category per year, from plan docs.
    const returnRates: Record<string, Record<number, number>> = {
      Electronics: { 2021: 0.081, 2022: 0.062, 2023: 0.054, 2024: 0.051, 2025: 0.050 },
      Clothing:    { 2021: 0.178, 2022: 0.098, 2023: 0.081, 2024: 0.073, 2025: 0.068 },
      Home:        { 2021: 0.00,  2022: 0.114, 2023: 0.092, 2024: 0.082, 2025: 0.075 },
      Books:       { 2021: 0.00,  2022: 0.028, 2023: 0.024, 2024: 0.023, 2025: 0.020 },
      Sports:      { 2021: 0.00,  2022: 0.00,  2023: 0.130, 2024: 0.094, 2025: 0.085 },
    };

    const returnReasons: Record<string, [string, number][]> = {
      Electronics: [['defective_product', 0.70], ['not_as_described', 0.20], ['changed_mind', 0.10]],
      Clothing:    [['wrong_size', 0.60], ['quality_issue', 0.25], ['changed_mind', 0.15]],
      Home:        [['not_as_described', 0.65], ['defective_product', 0.25], ['changed_mind', 0.10]],
      Books:       [['wrong_item', 0.70], ['changed_mind', 0.20], ['quality_issue', 0.10]],
      Sports:      [['changed_mind', 0.50], ['wrong_size', 0.35], ['quality_issue', 0.15]],
    };

    function pickReason(category: string): string {
      const dist = returnReasons[category] ?? returnReasons['Electronics'];
      const roll = Math.random();
      let cumulative = 0;
      for (const [reason, prob] of dist) {
        cumulative += prob;
        if (roll < cumulative) return reason;
      }
      return dist[0][0];
    }

    // Fetch all completed order_items with their category and order date
    const itemsResult = await client.query<{
      id: number; price: number; quantity: number; category: string; order_date: Date;
    }>(`
      SELECT oi.id, oi.price, oi.quantity, p.category, o.created_at AS order_date
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status = 'completed'
    `);

    let returnCount = 0;
    for (const item of itemsResult.rows) {
      const year = item.order_date.getFullYear();
      const rate = returnRates[item.category]?.[year] ?? 0;
      if (rate === 0) continue;
      if (Math.random() > rate) continue;

      const returnDate = new Date(item.order_date);
      returnDate.setDate(returnDate.getDate() + faker.number.int({ min: 3, max: 28 }));

      await client.query(
        'INSERT INTO returns (order_item_id, reason, refund_amount, created_at) VALUES ($1, $2, $3, $4)',
        [item.id, pickReason(item.category), item.price * item.quantity, returnDate]
      );
      returnCount++;
    }
    console.log(`✅ Returns created (${returnCount} rows)`);

    console.log('🎉 Seeding complete!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
