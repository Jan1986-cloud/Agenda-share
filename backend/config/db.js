import knex from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Nodig om een CJS-bestand te kunnen 'require'en in een ES-module
const require = createRequire(import.meta.url);

// Construeer een absoluut pad naar de knexfile.cjs in de project-root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const knexfilePath = path.resolve(__dirname, '..', '..', 'knexfile.cjs');

// Laad de CJS-configuratie
const knexfile = require(knexfilePath);

const environment = process.env.NODE_ENV || 'development';
const config = knexfile[environment];

const db = knex(config);

export default db;
