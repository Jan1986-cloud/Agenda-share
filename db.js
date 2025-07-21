import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const testConnection = async () => {
    let client;
    try {
        client = await pool.connect();
        console.log('Database connection test successful.');
    } catch (err) {
        console.error('Database connection test failed:', err);
        throw err; // Re-throw the error to stop the server startup
    } finally {
        if (client) client.release();
    }
};

export const createTables = async () => {
  const client = await pool.connect();
  try {
    // --- Migratie en creatie voor USERS tabel ---
    await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY, -- Begin met VARCHAR voor compatibiliteit bij create if not exists
                tokens JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                email VARCHAR(255) UNIQUE
            );
        `);
    
    // Controleer en migreer users.id naar UUID
    const userIdColumnType = await client.query(`
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_name='users' AND column_name='id'
    `);

    if (userIdColumnType.rows.length > 0 && userIdColumnType.rows[0].data_type !== 'uuid') {
        console.log('Migrating users table: id column is not UUID, attempting to alter type.');
        // Drop FKs die afhankelijk zijn van users.id voordat we het type wijzigen
        try {
            await client.query(`
                ALTER TABLE links DROP CONSTRAINT IF EXISTS links_user_id_fkey;
            `);
            console.log('Dropped links_user_id_fkey for users.id migration.');
             await client.query(`
                ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_user_id_fkey;
            `);
            console.log('Dropped appointments_user_id_fkey for users.id migration.');
        } catch (fkErr) {
            console.warn(`Could not drop FKs for users.id: ${fkErr.message}`);
        }
        
        // Nu de type conversie, alleen als er geen non-UUID data is
        const nonUuidUserDataExists = await client.query(`
            SELECT COUNT(*) FROM users WHERE id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
        `);

        if (nonUuidUserDataExists.rows[0].count > 0) {
            console.warn('WARNING: Cannot alter users.id to UUID. Existing data contains non-UUID values. Manual migration required.');
        } else {
            await client.query(`
                ALTER TABLE users 
                ALTER COLUMN id TYPE UUID USING (id::uuid);
            `);
            console.log('Altered users.id column type to UUID.');
        }
    } else if (userIdColumnType.rows.length > 0 && userIdColumnType.rows[0].data_type === 'uuid') {
        console.log('Users table already has UUID primary key. No migration needed for ID type.');
    } else {
        console.warn('WARNING: Could not determine type of users.id column. Manual check recommended.');
    }
    
    // De rest van de users migraties
    const userEmailColumns = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='users' AND column_name='email'
    `);
    if (userEmailColumns.rows.length === 0) {
        await client.query('ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE');
        console.log('Migrated users table: added email column.');
    }

    // --- Migratie en creatie voor LINKS tabel ---
    const linksTableExists = await client.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE  table_schema = 'public'
            AND    table_name   = 'links'
        );
    `);

    if (!linksTableExists.rows[0].exists) {
        // Gebruik direct UUID als primary key bij nieuwe aanmaak
        await client.query(`
            CREATE TABLE links (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id), 
                title VARCHAR(255) NOT NULL,
                duration INTEGER NOT NULL,
                buffer INTEGER NOT NULL,
                availability JSONB NOT NULL,
                request_count INTEGER DEFAULT 0,
                window_start_time TIMESTAMPTZ DEFAULT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('Links table created with UUID primary key.');
    } else {
        // Controleer en migreer links.id naar UUID
        const linksIdColumnType = await client.query(`
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name='links' AND column_name='id'
        `);

        if (linksIdColumnType.rows.length > 0 && linksIdColumnType.rows[0].data_type !== 'uuid') {
            console.log('Migrating links table: id column is not UUID, attempting to alter type.');
            // Drop Foreign Keys die afhankelijk zijn van links.id
            try {
                await client.query(`
                    ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_link_id_fkey;
                `);
                console.log('Dropped appointments_link_id_fkey for links.id migration.');
            } catch (fkErr) {
                console.warn(`Could not drop FK appointments_link_id_fkey (might not exist or other issue): ${fkErr.message}`);
            }
            
            const nonUuidDataExists = await client.query(`
                SELECT COUNT(*) FROM links WHERE id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
            `);

            if (nonUuidDataExists.rows[0].count > 0) {
                console.warn('WARNING: Cannot alter links.id to UUID. Existing data contains non-UUID values. Manual migration required for links.id.');
            } else {
                await client.query(`
                    ALTER TABLE links 
                    ALTER COLUMN id TYPE UUID USING (id::uuid);
                `);
                console.log('Altered links.id column type to UUID.');
            }
        } else if (linksIdColumnType.rows.length > 0 && linksIdColumnType.rows[0].data_type === 'uuid') {
            console.log('Links table already has UUID primary key. No migration needed for ID type.');
        } else {
            console.warn('WARNING: Could not determine type of links.id column. Manual check recommended.');
        }

        // Controleer en migreer links.user_id naar UUID
        const linksUserIdColumnType = await client.query(`
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name='links' AND column_name='user_id'
        `);
        if (linksUserIdColumnType.rows.length > 0 && linksUserIdColumnType.rows[0].data_type !== 'uuid') {
            console.log('Migrating links table: user_id column is not UUID, attempting to alter type.');
            try {
                await client.query(`
                    ALTER TABLE links DROP CONSTRAINT IF EXISTS links_user_id_fkey;
                `);
                console.log('Dropped links_user_id_fkey for links.user_id migration.');
             } catch (fkErr) {
                console.warn(`Could not drop FK links_user_id_fkey (might not exist or other issue): ${fkErr.message}`);
            }

            const nonUuidLinkUserIdDataExists = await client.query(`
                SELECT COUNT(*) FROM links WHERE user_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
            `);
            if (nonUuidLinkUserIdDataExists.rows[0].count > 0) {
                console.warn('WARNING: Cannot alter links.user_id to UUID. Existing data contains non-UUID values. Manual migration required for links.user_id.');
            } else {
                await client.query(`
                    ALTER TABLE links 
                    ALTER COLUMN user_id TYPE UUID USING (user_id::uuid);
                `);
                console.log('Altered links.user_id column type to UUID.');
            }
        }
    }

    // ... (rest van de links migraties, exact zoals in uw originele db.js, na de links tabel creatie/migratie) ...
    // Migration: Add start_address column if it doesn't exist
    const columns = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='links' AND column_name='start_address'
        `);
    if (columns.rows.length === 0) {
      await client.query(
        'ALTER TABLE links ADD COLUMN start_address VARCHAR(255)'
      );
      console.log('Migrated links table: added start_address column.');
    }

    const calendarIdColumn = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='links' AND column_name='calendar_id'
    `);
    if (calendarIdColumn.rows.length === 0) {
        await client.query(
            `ALTER TABLE links ADD COLUMN calendar_id VARCHAR(255) NOT NULL DEFAULT 'primary'`
        );
        console.log('Migrated links table: added calendar_id column.');
    }

    const maxTravelTimeColumn = await client.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name='links' AND column_name='max_travel_time'
    `);
    if (maxTravelTimeColumn.rows.length === 0) {
        await client.query(`ALTER TABLE links ADD COLUMN max_travel_time INTEGER`);
        console.log('Migrated links table: added max_travel_time column.');
    }

    const workdayModeColumn = await client.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name='links' AND column_name='workday_mode'
    `);
    if (workdayModeColumn.rows.length === 0) {
        await client.query(`ALTER TABLE links ADD COLUMN workday_mode VARCHAR(20) NOT NULL DEFAULT 'VAST'`);
        console.log('Migrated links table: added workday_mode column.');
    }

    const includeTravelStartColumn = await client.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name='links' AND column_name='include_travel_start'
    `);
    if (includeTravelStartColumn.rows.length === 0) {
        await client.query(`ALTER TABLE links ADD COLUMN include_travel_start BOOLEAN NOT NULL DEFAULT true`);
        console.log('Migrated links table: added include_travel_start column.');
    }

    const includeTravelEndColumn = await client.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name='links' AND column_name='include_travel_end'
    `);
    if (includeTravelEndColumn.rows.length === 0) {
        await client.query(`ALTER TABLE links ADD COLUMN include_travel_end BOOLEAN NOT NULL DEFAULT true`);
        console.log('Migrated links table: added include_travel_end column.');
    }

    const timezoneColumn = await client.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name='links' AND column_name='timezone'
    `);
    if (timezoneColumn.rows.length === 0) {
        await client.query(`ALTER TABLE links ADD COLUMN timezone VARCHAR(255) NOT NULL DEFAULT 'Europe/Amsterdam'`);
        console.log('Migrated links table: added timezone column.');
    }

    const descriptionColumn = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='links' AND column_name='description'
    `);
    if (descriptionColumn.rows.length === 0) {
        await client.query('ALTER TABLE links ADD COLUMN description TEXT');
        console.log('Migrated links table: added description column.');
    }

    const planningOffsetDaysColumn = await client.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name='links' AND column_name='planning_offset_days'
    `);
    if (planningOffsetDaysColumn.rows.length === 0) {
        await client.query(`ALTER TABLE links ADD COLUMN planning_offset_days INTEGER NOT NULL DEFAULT 0`);
        console.log('Migrated links table: added planning_offset_days column.');
    }

    const planningWindowDaysColumn = await client.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name='links' AND column_name='planning_window_days'
    `);
    if (planningWindowDaysColumn.rows.length === 0) {
        await client.query(`ALTER TABLE links ADD COLUMN planning_window_days INTEGER NOT NULL DEFAULT 14`);
        console.log('Migrated links table: added planning_window_days column.');
    }

    // --- Migratie en creatie voor APPOINTMENTS tabel ---
    const appointmentsTableExists = await client.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE  table_schema = 'public'
            AND    table_name   = 'appointments'
        );
    `);

    if (!appointmentsTableExists.rows[0].exists) {
        // Maak appointments tabel aan met UUIDs voor id, link_id en user_id
        await client.query(`
            CREATE TABLE appointments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                link_id UUID REFERENCES links(id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                comments TEXT,
                appointment_time TIMESTAMPTZ NOT NULL,
                destination_address TEXT,
                created_at TIMESTAMPTZ DEFAULT now()
            );
        `);
        console.log('Appointments table created with UUID primary and foreign keys.');
    } else {
        // Controleer en migreer appointments.id naar UUID
        const appointmentsIdColumnType = await client.query(`
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name='appointments' AND column_name='id'
        `);
        if (appointmentsIdColumnType.rows.length > 0 && appointmentsIdColumnType.rows[0].data_type !== 'uuid') {
            console.log('Migrating appointments table: id column is not UUID, attempting to alter type.');
            // Hier kunnen we geen veilige automatische migratie doen als '5' geen UUID is.
            // Dit is een kritieke waarschuwing die manuele actie vereist.
            console.error('CRITICAL ERROR: Appointments.id contains non-UUID data (e.g., "5"). Cannot automatically alter to UUID without data loss or manual transformation. Manual intervention required!');
            throw new Error('Appointments.id contains non-UUID data. Manual migration required.');
        } else if (appointmentsIdColumnType.rows.length > 0 && appointmentsIdColumnType.rows[0].data_type === 'uuid') {
            console.log('Appointments table id is already UUID. No migration needed.');
        }

        // Controleer en migreer appointments.link_id naar UUID
        const appointmentsLinkIdColumnType = await client.query(`
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name='appointments' AND column_name='link_id'
        `);
        if (appointmentsLinkIdColumnType.rows.length > 0 && appointmentsLinkIdColumnType.rows[0].data_type !== 'uuid') {
            console.log('Migrating appointments table: link_id column is not UUID, attempting to alter type.');
            try {
                await client.query(`
                    ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_link_id_fkey;
                `);
                console.log('Dropped appointments_link_id_fkey for appointments.link_id migration.');
            } catch (fkErr) {
                console.warn(`Could not drop FK appointments_link_id_fkey (might not exist or other issue): ${fkErr.message}`);
            }

            const nonUuidAppointmentLinkIdDataExists = await client.query(`
                SELECT COUNT(*) FROM appointments WHERE link_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
            `);
            if (nonUuidAppointmentLinkIdDataExists.rows[0].count > 0) {
                console.warn('WARNING: Cannot alter appointments.link_id to UUID. Existing data contains non-UUID values. Manual migration required.');
            } else {
                await client.query(`
                    ALTER TABLE appointments 
                    ALTER COLUMN link_id TYPE UUID USING (link_id::uuid);
                `);
                console.log('Altered appointments.link_id column type to UUID.');
            }
        } else if (appointmentsLinkIdColumnType.rows.length > 0 && appointmentsLinkIdColumnType.rows[0].data_type === 'uuid') {
            console.log('Appointments table link_id is already UUID. No migration needed.');
        }

        // Controleer en migreer appointments.user_id naar UUID
        const appointmentsUserIdColumnType = await client.query(`
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name='appointments' AND column_name='user_id'
        `);
        if (appointmentsUserIdColumnType.rows.length > 0 && appointmentsUserIdColumnType.rows[0].data_type !== 'uuid') {
            console.log('Migrating appointments table: user_id column is not UUID, attempting to alter type.');
            try {
                await client.query(`
                    ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_user_id_fkey;
                `);
                console.log('Dropped appointments_user_id_fkey for appointments.user_id migration.');
            } catch (fkErr) {
                console.warn(`Could not drop FK appointments_user_id_fkey (might not exist or other issue): ${fkErr.message}`);
            }

            const nonUuidAppointmentUserIdDataExists = await client.query(`
                SELECT COUNT(*) FROM appointments WHERE user_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
            `);
            if (nonUuidAppointmentUserIdDataExists.rows[0].count > 0) {
                console.warn('WARNING: Cannot alter appointments.user_id to UUID. Existing data contains non-UUID values. Manual migration required.');
            } else {
                await client.query(`
                    ALTER TABLE appointments 
                    ALTER COLUMN user_id TYPE UUID USING (user_id::uuid);
                `);
                console.log('Altered appointments.user_id column type to UUID.');
            }
        } else if (appointmentsUserIdColumnType.rows.length > 0 && appointmentsUserIdColumnType.rows[0].data_type === 'uuid') {
            console.log('Appointments table user_id is already UUID. No migration needed.');
        }

        // Recreate foreign keys after all type alterations
        const linksIdIsUuid = (await client.query(`SELECT data_type FROM information_schema.columns WHERE table_name='links' AND column_name='id'`)).rows[0]?.data_type === 'uuid';
        const usersIdIsUuid = (await client.query(`SELECT data_type FROM information_schema.columns WHERE table_name='users' AND column_name='id'`)).rows[0]?.data_type === 'uuid';
        
        if (linksIdIsUuid) {
            try {
                await client.query(`
                    ALTER TABLE appointments ADD CONSTRAINT appointments_link_id_fkey 
                    FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE;
                `);
                console.log('Restored appointments_link_id_fkey.');
            } catch (fkErr) {
                console.error(`ERROR: Could not restore appointments_link_id_fkey: ${fkErr.message}`);
            }
        } else {
            console.warn('WARNING: Cannot restore appointments_link_id_fkey as links.id is not yet UUID.');
        }

        if (usersIdIsUuid) {
            try {
                await client.query(`
                    ALTER TABLE appointments ADD CONSTRAINT appointments_user_id_fkey 
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
                `);
                console.log('Restored appointments_user_id_fkey.');
            } catch (fkErr) {
                console.error(`ERROR: Could not restore appointments_user_id_fkey: ${fkErr.message}`);
            }
        } else {
            console.warn('WARNING: Cannot restore appointments_user_id_fkey as users.id is not yet UUID.');
        }
    }

    // Overige migraties voor appointments (comments, google_event_id)
    const googleEventIdColumn = await client.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name='appointments' AND column_name='google_event_id'
    `);
    if (googleEventIdColumn.rows.length === 0) {
        await client.query(`ALTER TABLE appointments ADD COLUMN google_event_id VARCHAR(255)`);
        console.log('Migrated appointments table: added google_event_id column.');
    }

    const appointmentsCommentsColumn = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='appointments' AND column_name='comments'
    `);
    if (appointmentsCommentsColumn.rows.length === 0) {
        await client.query('ALTER TABLE appointments ADD COLUMN comments TEXT');
        console.log('Migrated appointments table: added comments column.');
    }

    // --- travel_time_cache ---
    await client.query(`
        CREATE TABLE IF NOT EXISTS travel_time_cache (
            origin_city VARCHAR(255) NOT NULL,
            destination_city VARCHAR(255) NOT NULL,
            duration_seconds INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (origin_city, destination_city)
        );
    `);

    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_travel_time_cache_origin 
        ON travel_time_cache (origin_city);
    `);
    
    console.log('Tables created successfully or already exist.');

  } catch (err) {
    console.error('Error creating/migrating tables:', err);
    throw err; // Re-throw the error to ensure server doesn't start with bad state
  } finally {
    client.release();
  }
};