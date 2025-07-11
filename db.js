const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const createTables = async () => {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                tokens JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

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
            await client.query('ALTER TABLE links ADD COLUMN start_address VARCHAR(255)');
            console.log('Migrated links table: added start_address column.');
        }

        console.log('Tables created successfully or already exist.');
    } catch (err) {
        console.error('Error creating/migrating tables:', err);
    } finally {
        client.release();
    }
};

module.exports = {
    pool,
    createTables
};
