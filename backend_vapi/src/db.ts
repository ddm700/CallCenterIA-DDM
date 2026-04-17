import pg from 'pg';
import { config } from './config';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10
});

export async function withClient<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
