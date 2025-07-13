#!/usr/bin/env node
/**
 * Quick test script to verify that local API keys and URLs from .env are functional.
 * Tests:
 *  - GOOGLE_MAPS_API_KEY (Geocoding endpoint)
 *  - DATABASE_URL (Postgres or SQLite file)
 *  - DATABASE_PUBLIC_URL (HEAD request)
 *  - GEMINI_API_KEY presence
 *
 * Usage:
 *   node tools/test-keys.js
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { Client } from 'pg';

dotenv.config();

function checkEnvVar(name) {
  if (process.env[name]) {
    console.log(`✅ ${name} is set`);
  } else {
    console.log(`❌ ${name} is not set`);
  }
}

async function testGoogleMaps() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    console.log('❌ GOOGLE_MAPS_API_KEY is not set');
    return;
  }
  console.log('🔍 Testing Google Maps API Key...');
  const address = '1600 Amphitheatre Parkway, Mountain View, CA';
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    address
  )}&key=${key}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.results?.length > 0) {
      const loc = data.results[0].geometry.location;
      console.log(
        `✅ Google Maps API Key is valid. Geocoded location: ${loc.lat}, ${loc.lng}`
      );
    } else {
      console.log(
        `❌ Google Maps API Key test failed. Status: ${data.status}. ${
          data.error_message || ''
        }`
      );
    }
  } catch (err) {
    console.log('❌ Error testing Google Maps API Key:', err.message);
  }
}

async function testDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('❌ DATABASE_URL is not set');
    return;
  }
  console.log('🔍 Testing DATABASE_URL...');
  if (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) {
    const client = new Client({ connectionString: dbUrl });
    try {
      await client.connect();
      await client.query('SELECT 1');
      console.log('✅ Connected to Postgres database and SELECT 1 succeeded');
    } catch (err) {
      console.log('❌ Postgres test failed:', err.message);
    } finally {
      await client.end();
    }
  } else if (dbUrl.startsWith('sqlite:')) {
    console.log(`ℹ️  SQLite database URL: ${dbUrl}`);
  } else {
    console.log('⚠️  DATABASE_URL protocol not recognized, skipping connection test');
  }
}

async function testUrl(name) {
  const url = process.env[name];
  if (!url) {
    console.log(`❌ ${name} is not set`);
    return;
  }
  console.log(`🔍 Testing ${name}...`);
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) {
      console.log(`✅ ${name} is reachable. Status: ${res.status}`);
    } else {
      console.log(`❌ ${name} unreachable. Status: ${res.status}`);
    }
  } catch (err) {
    console.log(`❌ Error testing ${name}:`, err.message);
  }
}

async function main() {
  console.log('🚀 Verifying environment variables and connectivity...');
  console.log();
  checkEnvVar('GEMINI_API_KEY');
  checkEnvVar('DATABASE_URL');
  checkEnvVar('DATABASE_PUBLIC_URL');
  console.log();
  await testGoogleMaps();
  console.log();
  await testDatabase();
  console.log();
  await testUrl('DATABASE_PUBLIC_URL');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});