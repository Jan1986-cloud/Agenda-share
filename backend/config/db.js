
import knex from 'knex';
import knexfile from '../../knexfile.cjs';

const environment = process.env.NODE_ENV || 'development';
const config = knexfile[environment];

const db = knex(config);

export default db;
