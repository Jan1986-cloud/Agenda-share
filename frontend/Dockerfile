# Stage 1: Build the React application
FROM node:20-slim AS build

# Set the working directory for the entire app
WORKDIR /app

# Copy shared directory first, as it's a dependency
COPY shared ./shared

# Copy frontend package files
COPY frontend/package.json frontend/package-lock.json ./frontend/

# Set frontend as working directory and install dependencies
WORKDIR /app/frontend
RUN npm ci

# Copy the rest of the frontend source code, including nginx.conf
COPY frontend/ .

# Build the application for production
RUN npm run build

# Stage 2: Serve the static files with Nginx
FROM nginx:stable-alpine AS production

# Copy the built static files from the 'build' stage
# The build output is in /app/frontend/dist
COPY --from=build /app/frontend/dist /usr/share/nginx/html

# Copy the custom Nginx configuration from the build stage
COPY --from=build /app/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# The default Nginx command will start the server
CMD ["nginx", "-g", "daemon off;"]