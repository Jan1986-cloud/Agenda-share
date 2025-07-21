/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Enable pgcrypto extension for gen_random_uuid()
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // --- Users Table ---
  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', function (table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('email').notNullable().unique();
      table.jsonb('tokens').notNullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  }

  // --- Links Table ---
  if (!(await knex.schema.hasTable('links'))) {
    await knex.schema.createTable('links', function (table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.string('title').notNullable();
      table.integer('duration').notNullable();
      table.integer('buffer').notNullable();
      table.jsonb('availability').notNullable();
      table.integer('request_count').defaultTo(0);
      table.timestamp('window_start_time', { useTz: true }).nullable();
      table.string('start_address').nullable();
      table.string('calendar_id').notNullable().defaultTo('primary');
      table.integer('max_travel_time').nullable();
      table.string('workday_mode', 20).notNullable().defaultTo('VAST');
      table.boolean('include_travel_start').notNullable().defaultTo(true);
      table.boolean('include_travel_end').notNullable().defaultTo(true);
      table.string('timezone').notNullable().defaultTo('Europe/Amsterdam');
      table.text('description').nullable();
      table.integer('planning_offset_days').notNullable().defaultTo(0);
      table.integer('planning_window_days').notNullable().defaultTo(14);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  }

  // --- Appointments Table ---
  if (!(await knex.schema.hasTable('appointments'))) {
    await knex.schema.createTable('appointments', function (table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('link_id').references('id').inTable('links').onDelete('CASCADE');
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.string('name').notNullable();
      table.string('email').notNullable();
      table.string('phone', 50).nullable();
      table.text('comments').nullable();
      table.timestamp('appointment_time', { useTz: true }).notNullable();
      table.text('destination_address').nullable();
      table.string('google_event_id').nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  }

  // --- Travel Time Cache Table ---
  if (!(await knex.schema.hasTable('travel_time_cache'))) {
    await knex.schema.createTable('travel_time_cache', function (table) {
      table.string('origin_city').notNullable();
      table.string('destination_city').notNullable();
      table.integer('duration_seconds').notNullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.primary(['origin_city', 'destination_city']);
      table.index('origin_city', 'idx_travel_time_cache_origin');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('appointments');
  await knex.schema.dropTableIfExists('links');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('travel_time_cache');
  await knex.raw('DROP EXTENSION IF EXISTS "pgcrypto"');
};
