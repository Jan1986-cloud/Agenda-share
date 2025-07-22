// Update with your config settings.
require('dotenv').config();

module.exports = {
  development: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { require: true },
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations',
    },
    seeds: {
      directory: './seeds',
    }
  },

  staging: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { require: true },
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations',
    },
    seeds: {
      directory: './seeds',
    }
  },

  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { require: true },
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations',
    },
    seeds: {
      directory: './seeds',
    }
  }
};