import fs from 'node:fs';
import path from 'node:path';
import { pool, withClient } from '../db';

async function main() {
  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  await withClient(async (c) => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    for (const f of files) {
      const id = f;
      const already = await c.query(`SELECT 1 FROM schema_migrations WHERE id=$1`, [id]);
      if (already.rowCount) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf-8');
      await c.query('BEGIN');
      try {
        await c.query(sql);
        await c.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [id]);
        await c.query('COMMIT');
        // eslint-disable-next-line no-console
        console.log(`Applied migration: ${id}`);
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    }
  });

  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
