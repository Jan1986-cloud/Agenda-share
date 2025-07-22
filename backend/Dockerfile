# Base Image
FROM node:20-slim AS base

# Set working directory for the entire app
WORKDIR /app

# Copy shared directory first, as it's a dependency
COPY shared ./shared

# Copy backend package files
COPY backend/package.json backend/package-lock.json ./backend/

# Set backend as working directory and install dependencies
WORKDIR /app/backend
RUN npm ci --omit=dev

# Copy the rest of the backend application code
COPY backend/ .

# Expose the port the app runs on
EXPOSE 3000

# The command to run the application from the correct directory
CMD ["/bin/sh", "-c", "npx knex migrate:latest && node server.js"]