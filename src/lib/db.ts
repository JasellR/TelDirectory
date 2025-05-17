
'use server';

import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';
import bcrypt from 'bcrypt';

const DB_FILE = path.join(process.cwd(), 'teldirectory.db');
const SALT_ROUNDS = 10;

let dbInstance: Database | null = null;

async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await open({
      filename: DB_FILE,
      driver: sqlite3.Database,
    });
  }
  return dbInstance;
}

export async function initializeDb(): Promise<void> {
  const db = await getDb();
  console.log('[DB] Initializing database...');

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
  } else {
    console.log('[DB] Users table already has entries or count could not be retrieved.');
  }
}

// Initialize DB when this module is loaded
initializeDb().catch(console.error);

export { getDb, bcrypt, SALT_ROUNDS };
