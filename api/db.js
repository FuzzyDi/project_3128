// db.js
const { Pool } = require('pg');

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:password123@postgres:5432/project_3128';

console.log('[DB] Using connection string:', connectionString);

const pool = new Pool({ connectionString });

module.exports = { pool };
