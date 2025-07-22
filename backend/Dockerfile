# Stage 1: Base Image
FROM node:20-slim AS base

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
# The PORT environment variable will be set by Railway, defaulting to 3000 if not set.
EXPOSE 3000

# The command to run the application
# This will run migrations and then start the server.
CMD ["npx", "knex", "migrate:latest", "&&", "node", "server.js"]
