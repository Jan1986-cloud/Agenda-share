#!/bin/sh

# Vervang de poortvariabele in de Nginx-configuratie
envsubst '${PORT}' < /etc/nginx/conf.d/default.conf > /etc/nginx/conf.d/default.conf.tmp
mv /etc/nginx/conf.d/default.conf.tmp /etc/nginx/conf.d/default.conf

# Start Nginx en houd de container actief
exec nginx -g 'daemon off;'
