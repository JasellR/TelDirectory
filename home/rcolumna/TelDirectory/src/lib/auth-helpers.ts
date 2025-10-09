
// This is NOT a server actions file, so it does not need 'use server'.
// It's a standard server-side utility module.

import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export { bcrypt, SALT_ROUNDS };
