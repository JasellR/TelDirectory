
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';
import bcrypt from 'bcrypt';

const DB_FILE = path.join(process.cwd(), 'teldirectory.db');
const SALT_ROUNDS = 10;

let dbInstance: Database | null = null;
let dbInitialized = false;

async function _initializeDbSchema(db: Database): Promise<void> {
  if (dbInitialized) return;

  console.log('[DB] Initializing database schema and seeding if necessary...');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      hashedPassword TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('[DB] "users" table ensured.');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS extension_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      extension_number TEXT NOT NULL,
      locality_id TEXT NOT NULL, -- The department/locality XML filename ID
      user_name TEXT, -- DisplayName from AD / Name from XML
      organization TEXT,
      ad_department TEXT, -- Department name as it comes from AD
      job_title TEXT,
      email TEXT,
      main_phone_number TEXT,
      source TEXT DEFAULT 'xml', -- 'xml', 'ad', 'csv'
      last_synced DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(extension_number, locality_id, source) 
    );
  `);
  console.log('[DB] "extension_details" table ensured.');
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_extension_details_number_locality ON extension_details (extension_number, locality_id);`);
  console.log('[DB] Index for "extension_details" ensured.');


  // Seed initial admin user if no users exist
  const userCount = await db.get('SELECT COUNT(*) as count FROM users');
  if (userCount && userCount.count === 0) {
    const defaultAdminUsername = 'admin';
    const defaultAdminPassword = 'admin123'; // THIS SHOULD BE CHANGED IN A REAL ENVIRONMENT
    try {
      const hashedPassword = await bcrypt.hash(defaultAdminPassword, SALT_ROUNDS);
      await db.run(
        'INSERT INTO users (username, hashedPassword) VALUES (?, ?)',
        defaultAdminUsername,
        hashedPassword
      );
      console.log(`[DB] Seeded default admin user: ${defaultAdminUsername} / ${defaultAdminPassword}`);
      console.warn(`[DB_SECURITY] The default admin password '${defaultAdminPassword}' is insecure and should be changed immediately if this were a production environment.`);
    } catch (hashError) {
      console.error('[DB] Error hashing default admin password during seed:', hashError);
    }
  } else if (userCount) {
    console.log(`[DB] Users table already has ${userCount.count} entries. No seeding needed.`);
  } else {
     console.warn('[DB] Could not retrieve user count. Seeding check skipped.');
  }
  dbInitialized = true;
  console.log('[DB] Database schema initialization complete.');
}

async function getDb(): Promise<Database> {
  if (!dbInstance) {
    console.log('[DB] Opening database connection...');
    dbInstance = await open({
      filename: DB_FILE,
      driver: sqlite3.Database,
    });
    console.log('[DB] Database connection opened.');
    // Initialize schema and seed data on first connection
    await _initializeDbSchema(dbInstance);
  } else if (!dbInitialized) {
    console.log('[DB] Database instance exists, ensuring schema is initialized...');
    await _initializeDbSchema(dbInstance);
  }
  return dbInstance;
}

export { getDb, bcrypt, SALT_ROUNDS };
