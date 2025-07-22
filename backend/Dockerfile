# STAGE 1: Broncode ophalen
# We klonen de gehele repository om toegang te krijgen tot de 'shared' map.
FROM alpine/git:latest AS source
WORKDIR /source
RUN git clone https://github.com/Jan1986-cloud/Agenda-share.git .
# Specifiek de juiste branch uitchecken voor de build
RUN git checkout feature/architectuur-herstel

# STAGE 2: Backend bouwen en uitvoeren
FROM node:20-slim
WORKDIR /app

# Kopieer de benodigde mappen vanuit de 'source' stage
COPY --from=source /source/backend/ .
COPY --from=source /source/shared/ ./shared/

# Installeer dependencies en voer de build uit
RUN npm ci --omit=dev

EXPOSE 3000
# Het startcommando blijft robuust met absolute paden
CMD ["/bin/sh", "-c", "npx knex migrate:latest --knexfile /app/knexfile.cjs && node /app/server.js"]