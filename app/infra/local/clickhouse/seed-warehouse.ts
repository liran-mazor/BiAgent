/**
 * ClickHouse warehouse seeder — 5 years of realistic ecommerce data.
 *
 * Writes directly to ClickHouse (bypasses Kafka — historical seed only).
 * Idempotent: truncates tables before inserting.
 *
 * Run:
 *   npm run seed-warehouse
 *
 * Data model:
 *   5 categories × 20 products = 100 products
 *   800 customers
 *   ~72,000 orders over 60 months (Jan 2021 – Mar 2026)
 *   monthly_targets — per category per month
 *   reviews — ~30% of orders get a review
 */

import 'dotenv/config';
import { createClient } from '@clickhouse/client';
import { faker } from '@faker-js/faker';

faker.seed(42); // reproducible

const ch = createClient({
  url:      process.env.CLICKHOUSE_HOST     ?? 'http://localhost:8123',
  database: process.env.CLICKHOUSE_DATABASE ?? 'biagent',
  username: process.env.CLICKHOUSE_USER     ?? 'biagent',
  password: process.env.CLICKHOUSE_PASSWORD ?? 'biagent123',
});

// ── Domain constants ──────────────────────────────────────────────────────────

const CATEGORIES = ['Electronics', 'Sports', 'Books', 'Home', 'Fashion'] as const;

// Revenue targets per category per month (base, grows YoY ~15%)
const BASE_MONTHLY_TARGET: Record<string, number> = {
  Electronics: 280_000,
  Sports:      95_000,
  Books:       45_000,
  Home:        110_000,
  Fashion:     130_000,
};

// Price ranges per category
const PRICE_RANGE: Record<string, [number, number]> = {
  Electronics: [29.99, 1299.99],
  Sports:      [9.99,  349.99],
  Books:       [7.99,  49.99],
  Home:        [14.99, 499.99],
  Fashion:     [19.99, 299.99],
};

// Seasonal multipliers (index 0 = Jan)
const SEASONAL: number[] = [0.80, 0.75, 0.85, 0.90, 0.95, 1.00, 1.05, 1.00, 1.10, 1.15, 1.30, 1.60];

// ── Date helpers ──────────────────────────────────────────────────────────────

function toDateTime(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function monthsBetween(start: Date, end: Date): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    result.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
}

// ── Generators ────────────────────────────────────────────────────────────────

function price(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const START = new Date('2021-01-01');
  const END   = new Date('2026-03-22');
  const months = monthsBetween(START, END); // 63 months

  // ── Products ──────────────────────────────────────────────────────────────
  console.log('Generating products…');
  const products: Array<{ id: number; name: string; category: string; price: number; created_at: string }> = [];
  let productId = 1;
  for (const cat of CATEGORIES) {
    const [min, max] = PRICE_RANGE[cat];
    for (let i = 0; i < 20; i++, productId++) {
      products.push({
        id:         productId,
        name:       `${faker.commerce.productAdjective()} ${faker.commerce.product()} (${cat})`,
        category:   cat,
        price:      price(min, max),
        created_at: toDateTime(faker.date.between({ from: START, to: new Date('2021-06-01') })),
      });
    }
  }

  // ── Customers ─────────────────────────────────────────────────────────────
  console.log('Generating customers…');
  const customers: Array<{ id: number; email: string; name: string; registered_at: string }> = [];
  for (let i = 1; i <= 800; i++) {
    customers.push({
      id:            i,
      email:         faker.internet.email(),
      name:          faker.person.fullName(),
      registered_at: toDateTime(faker.date.between({ from: START, to: END })),
    });
  }

  // ── Orders + order_items ──────────────────────────────────────────────────
  console.log('Generating orders…');
  const orders:     Array<{ id: number; customer_id: number; total_amount: number; placed_at: string }> = [];
  const orderItems: Array<{ order_id: number; product_id: number; quantity: number; price: number; placed_at: string }> = [];

  let orderId = 1;
  const productsByCategory = CATEGORIES.reduce<Record<string, typeof products>>((acc, cat) => {
    acc[cat] = products.filter(p => p.category === cat);
    return acc;
  }, {} as any);

  for (const { year, month } of months) {
    const seasonal    = SEASONAL[month - 1];
    // YoY growth ~15%
    const yearsIn     = year - 2021;
    const growth      = Math.pow(1.15, yearsIn);
    // Base ~100 orders/month, scaled by season + growth
    const orderCount  = Math.round(100 * seasonal * growth * (0.85 + Math.random() * 0.3));

    for (let o = 0; o < orderCount; o++, orderId++) {
      const day        = faker.number.int({ min: 1, max: 28 });
      const placedAt   = new Date(year, month - 1, day, faker.number.int({ min: 6, max: 23 }));
      const customerId = faker.number.int({ min: 1, max: 800 });

      // 1-3 items per order
      const itemCount = faker.number.int({ min: 1, max: 3 });
      const items: typeof orderItems = [];
      const usedProducts = new Set<number>();

      for (let i = 0; i < itemCount; i++) {
        const cat      = faker.helpers.arrayElement(CATEGORIES);
        const pool     = productsByCategory[cat];
        let   prod     = faker.helpers.arrayElement(pool);
        let   attempts = 0;
        while (usedProducts.has(prod.id) && attempts < 10) {
          prod = faker.helpers.arrayElement(pool);
          attempts++;
        }
        usedProducts.add(prod.id);

        const quantity = faker.number.int({ min: 1, max: 3 });
        const unitPrice = prod.price;
        items.push({ order_id: orderId, product_id: prod.id, quantity, price: unitPrice, placed_at: toDateTime(placedAt) });
      }

      const totalAmount = Math.round(items.reduce((s, i) => s + i.quantity * i.price, 0) * 100) / 100;
      orders.push({ id: orderId, customer_id: customerId, total_amount: totalAmount, placed_at: toDateTime(placedAt) });
      orderItems.push(...items);
    }
  }

  // ── Reviews ───────────────────────────────────────────────────────────────
  console.log('Generating reviews…');
  const reviews: Array<{ id: number; product_id: number; customer_id: number; rating: number; comment: string | null; created_at: string }> = [];
  // ~30% of orders get a review on one of their items
  let reviewId = 1;
  const reviewedSet = new Set<string>();
  for (const order of orders) {
    if (Math.random() > 0.30) continue;
    const items = orderItems.filter(i => i.order_id === order.id);
    if (items.length === 0) continue;
    const item = faker.helpers.arrayElement(items);
    const key  = `${item.product_id}-${order.customer_id}`;
    if (reviewedSet.has(key)) continue;
    reviewedSet.add(key);

    const rating   = faker.number.int({ min: 1, max: 5 });
    const hasComment = Math.random() > 0.4;
    reviews.push({
      id:          reviewId++,
      product_id:  item.product_id,
      customer_id: order.customer_id,
      rating,
      comment:     hasComment ? faker.lorem.sentence() : null,
      created_at:  toDateTime(new Date(new Date(order.placed_at).getTime() + faker.number.int({ min: 1, max: 7 }) * 86400000)),
    });
  }

  // ── Monthly targets ───────────────────────────────────────────────────────
  console.log('Generating monthly targets…');
  const targets: Array<{ year: number; month: number; category: string; revenue_target: number; orders_target: number }> = [];
  for (const { year, month } of months) {
    for (const cat of CATEGORIES) {
      const yearsIn = year - 2021;
      const base    = BASE_MONTHLY_TARGET[cat] * Math.pow(1.15, yearsIn) * SEASONAL[month - 1];
      targets.push({
        year,
        month,
        category:       cat,
        revenue_target: Math.round(base / 100) * 100,
        orders_target:  Math.round(base / 500),
      });
    }
  }

  // ── Write to ClickHouse ───────────────────────────────────────────────────
  console.log('\nTruncating ClickHouse tables…');
  for (const table of ['order_items', 'orders', 'reviews', 'products', 'customers', 'monthly_targets']) {
    await ch.command({ query: `TRUNCATE TABLE ${table}` });
  }

  const BATCH = 5_000;

  async function insert(table: string, rows: any[]): Promise<void> {
    for (let i = 0; i < rows.length; i += BATCH) {
      await ch.insert({ table, values: rows.slice(i, i + BATCH), format: 'JSONEachRow' });
    }
    console.log(`  ✓ ${table}: ${rows.length.toLocaleString()} rows`);
  }

  console.log('\nInserting into ClickHouse…');
  await insert('products',        products);
  await insert('customers',       customers);
  await insert('orders',          orders);
  await insert('order_items',     orderItems);
  await insert('reviews',         reviews);
  await insert('monthly_targets', targets);

  await ch.close();

  console.log(`
Done.
  Date range : ${START.toISOString().slice(0,7)} → ${END.toISOString().slice(0,7)}
  Products   : ${products.length}
  Customers  : ${customers.length}
  Orders     : ${orders.length.toLocaleString()}
  Order items: ${orderItems.length.toLocaleString()}
  Reviews    : ${reviews.length.toLocaleString()}
  Targets    : ${targets.length} (${CATEGORIES.length} categories × ${months.length} months)
`);
}

main().catch(err => {
  console.error('[seed-warehouse] fatal:', err.message);
  process.exit(1);
});
