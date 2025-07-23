import knex from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';

// Construct an absolute path to the knexfile.cjs in the project root.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const knexfilePath = path.resolve(__dirname, '..', '..', 'knexfile.cjs');

// Since we are in an ES module and need to load a CJS file by a variable path,
// we must use a dynamic import(). We assume top-level await is supported.
const knexfileModule = await import(knexfilePath);
const knexfile = knexfileModule.default; // Access the default export for CJS modules

const environment = process.env.NODE_ENV || 'development';
const config = knexfile[environment];

const db = knex(config);

export default db;