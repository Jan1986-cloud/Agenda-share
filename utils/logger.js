// Bestand: utils/logger.js

import winston from 'winston';

const { combine, timestamp, json, errors } = winston.format;

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp(),
    errors({ stack: true }), // Log de stack trace bij errors
    json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

export default logger;
