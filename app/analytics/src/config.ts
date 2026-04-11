export const CLICKHOUSE_CONFIG = {
  url:      process.env.CLICKHOUSE_HOST     ?? 'http://localhost:8123',
  database: process.env.CLICKHOUSE_DATABASE ?? 'biagent',
  username: process.env.CLICKHOUSE_USER     ?? 'biagent',
  password: process.env.CLICKHOUSE_PASSWORD ?? 'biagent123',
};

