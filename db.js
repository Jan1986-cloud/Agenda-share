import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const testConnection = async () => {
    let client;
    try {
        client = await pool.connect();
        console.log('Database connection test successful.');
    } catch (err) {
        console.error('Database connection test failed:', err);
        throw err; // Re-throw the error to stop the server startup
    } finally {
        if (client) client.release();
    }
};

export const createTables = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                tokens JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

    // Migration: Add email column to users table if it doesn't exist
    const userColumns = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='users' AND column_name='email'
    `);
    if (userColumns.rows.length === 0) {
        await client.query('ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE');
        console.log('Migrated users table: added email column.');
    }
    
    await client.query(`
            CREATE TABLE IF NOT EXISTS links (
                id VARCHAR(255) PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL REFERENCES users(id),
                title VARCHAR(255) NOT NULL,
                duration INTEGER NOT NULL,
                buffer INTEGER NOT NULL,
                availability JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

    // Migration: Add start_address column if it doesn't exist
    const columns = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='links' AND column_name='start_address'
        `);
    if (columns.rows.length === 0) {
      await client.query(
        'ALTER TABLE links ADD COLUMN start_address VARCHAR(255)'
      );
      console.log('Migrated links table: added start_address column.');
    }

    // Migration: Add calendar_id column if it doesn't exist
    const calendarIdColumn = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='links' AND column_name='calendar_id'
    `);
    if (calendarIdColumn.rows.length === 0) {
        await client.query(
            `ALTER TABLE links ADD COLUMN calendar_id VARCHAR(255) NOT NULL DEFAULT 'primary'`
        );
        console.log('Migrated links table: added calendar_id column.');
    }

    await client.query(`
        CREATE TABLE IF NOT EXISTS appointments (
            id SERIAL PRIMARY KEY,
            link_id VARCHAR(255) NOT NULL REFERENCES links(id) ON DELETE CASCADE,
            user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            phone VARCHAR(255) NOT NULL,
            appointment_time TIMESTAMPTZ NOT NULL,
            destination_address TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);

    console.log('Tables created successfully or already exist.');
  } catch (err) {
    console.error('Error creating/migrating tables:', err);
  } finally {
    client.release();
  }
};

