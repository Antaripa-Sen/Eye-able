const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
require('dotenv').config();

async function migrate() {
  console.log('🚀 Running EyeAble database migrations...');
  const client = await pool.connect();
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
    console.log('✅ All tables created successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
