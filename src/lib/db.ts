
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
    // This case might occur if dbInstance was somehow set but initialization didn't complete
    // or if multiple near-simultaneous calls happen before dbInitialized is true.
    // The dbInitialized flag inside _initializeDbSchema should prevent redundant DDL execution.
    console.log('[DB] Database instance exists, ensuring schema is initialized...');
    await _initializeDbSchema(dbInstance);
  }
  return dbInstance;
}

export { getDb, bcrypt, SALT_ROUNDS };
