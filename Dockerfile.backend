# Base Image
FROM node:20-slim AS base

# Set working directory for the entire app
WORKDIR /app

# Copy all files from the build context (the repo root)
COPY . .

# Set backend as working directory and install dependencies
WORKDIR /app/backend
RUN npm ci --omit=dev

# Expose the port the app runs on
EXPOSE 3000

# The command to run the application from the correct directory.
# Using absolute paths for knexfile and server.js for maximum robustness.
CMD ["/bin/sh", "-c", "npx knex migrate:latest --knexfile /app/backend/knexfile.cjs && node /app/backend/server.js"]
