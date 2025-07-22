# Stage 1: Build the React application
FROM node:20-slim AS build

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the frontend source code
COPY . .

# Build the application for production
# This will create a 'dist' folder with the static files.
RUN npm run build

# Stage 2: Serve the static files with Nginx
FROM nginx:stable-alpine AS production

# Copy the built static files from the 'build' stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy the custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# The default Nginx command will start the server
CMD ["nginx", "-g", "daemon off;"]
