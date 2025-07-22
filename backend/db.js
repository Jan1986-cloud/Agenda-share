import knex from 'knex';
import pg from 'pg';
import config from './knexfile.cjs';
import dotenv from 'dotenv';
import logger from './utils/logger.js';

// Load environment variables
dotenv.config();

// Determine the environment, default to 'development'
const environment = process.env.NODE_ENV || 'development';

// Get the configuration for the current environment
const environmentConfig = config[environment];

// Initialize Knex for general application use
const db = knex(environmentConfig);

// Create a separate pg.Pool for libraries that need it directly (e.g., connect-pg-simple)
// Knex doesn't expose the pool directly in a way that's safe to share,
// so we create a new one with the same connection details.
export const pool = new pg.Pool(environmentConfig.connection);

// Test connection function (using Knex)
export const testConnection = async () => {
    try {
        await db.raw('SELECT 1+1 as result');
        logger.info('Database connection test successful using Knex.');
    } catch (err) {
        logger.error({ message: 'Database connection test failed', error: err });
        throw err; // Re-throw the error to stop the server startup
    }
};

// Export the initialized Knex instance as the default export
export default db;
