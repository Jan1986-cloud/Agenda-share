// backend/knexfile.cjs

// Laad de .env variabelen voor lokale ontwikkeling
require('dotenv').config({ path: __dirname + '/../.env' });

// Bouw een robuuste productie-connectie die de DATABASE_URL combineert met de SSL-setting
const productionConnection = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    }
  : {};

module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      port: process.env.DB_PORT,
    },
    migrations: {
      directory: './migrations',
    },
    seeds: {
      directory: './seeds',
    },
  },

  production: {
    client: 'pg',
    // Gebruik de robuuste connectie-variabele
    connection: productionConnection,
    migrations: {
      directory: './migrations',
    },
    seeds: {
      directory: './seeds',
    },
  },
};