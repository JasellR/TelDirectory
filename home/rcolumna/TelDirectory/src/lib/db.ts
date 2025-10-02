
'use server';

import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';
import bcrypt from 'bcrypt';

const DB_FILE = path.join(process.cwd(), 'teldirectory.db');
const SALT_ROUNDS = 10;

let dbPromise: Promise<Database> | null = null;

async function initializeDb(): Promise<Database> {
  console.log('[DB] Opening database connection...');
  const db = await open({
    filename: DB_FILE,
    driver: sqlite3.Database,
  });
  console.log('[DB] Database connection opened.');

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
      locality_id TEXT NOT NULL,
      user_name TEXT,
      organization TEXT,
      ad_department TEXT,
      job_title TEXT,
      email TEXT,
      main_phone_number TEXT,
      source TEXT DEFAULT 'xml',
      last_synced DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(extension_number, locality_id, source)
    );
  `);
  console.log('[DB] "extension_details" table ensured.');
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_extension_details_number_locality ON extension_details (extension_number, locality_id);`);
  console.log('[DB] Index for "extension_details" ensured.');

  const userCount = await db.get('SELECT COUNT(*) as count FROM users');
  if (userCount && userCount.count === 0) {
    const defaultAdminUsername = 'admin';
    const defaultAdminPassword = 'admin123';
    try {
      const hashedPassword = await bcrypt.hash(defaultAdminPassword, SALT_ROUNDS);
      await db.run(
        'INSERT INTO users (username, hashedPassword) VALUES (?, ?)',
        defaultAdminUsername,
        hashedPassword
      );
      console.log(`[DB] Seeded default admin user: ${defaultAdminUsername}`);
      console.warn(`[DB_SECURITY] Default admin password is set and should be changed in a real environment.`);
    } catch (hashError) {
      console.error('[DB] Error hashing default admin password during seed:', hashError);
    }
  } else {
    console.log(`[DB] Users table already populated. Seeding not required.`);
  }

  console.log('[DB] Database schema initialization complete.');
  return db;
}

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = initializeDb();
  }
  return dbPromise;
}

export { getDb, bcrypt, SALT_ROUNDS };
