# STAGE 1: Broncode ophalen
FROM alpine/git:latest AS source
WORKDIR /source
RUN git clone https://github.com/Jan1986-cloud/Agenda-share.git .
RUN git checkout feature/architectuur-herstel

# STAGE 2: Frontend bouwen
FROM node:20-slim AS build
WORKDIR /app

# Kopieer de benodigde mappen vanuit de 'source' stage
COPY --from=source /source/frontend/ .
COPY --from=source /source/shared/ ./shared/

# Installeer dependencies en bouw de statische bestanden
RUN npm ci
RUN npm run build

# STAGE 3: Serveer de statische bestanden met Nginx
FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]