import knex from 'knex';
import path from 'path';
import { createRequire } from 'module';

// Nodig om een CJS-bestand te kunnen 'require'en in een ES-module
const require = createRequire(import.meta.url);

// Het pad wordt bepaald vanuit de werkdirectory, wat in Docker consistent '/app' is.
const knexfilePath = path.resolve(process.cwd(), 'knexfile.cjs');

// Laad de CJS-configuratie
const knexfile = require(knexfilePath);

const environment = process.env.NODE_ENV || 'development';
const config = knexfile[environment];

const db = knex(config);

export default db;