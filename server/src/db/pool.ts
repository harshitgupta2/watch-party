import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// An idle client throwing (e.g. the DB connection dropping) must not crash
// the process — the app keeps serving live traffic off in-memory state even
// if persistence is briefly unavailable.
pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});
