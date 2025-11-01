import { hashPassword } from './src/helpers/password.js';
import { generateToken } from './src/helpers/jwt.js';
import app from './src/routes/auth/index.js';
import { setupTestDb, getTestDb } from './src/__tests__/helpers/db.js';
import { users } from './src/entities/users.js';

await setupTestDb();
const db = getTestDb();

const passwordHash = await hashPassword('OldPassword123!');
const [user] = await db.insert(users).values({
  email: 'user@example.com',
  passwordHash,
  role: 'user',
  status: 'active',
}).returning();

const token = generateToken({
  userId: user.id,
  role: user.role,
});

const req = new Request('http://localhost/change-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({
    currentPassword: 'OldPassword123!',
    newPassword: 'NewPassword456!',
  }),
});

const res = await app.fetch(req);
console.log('Status:', res.status);
console.log('Headers:', Object.fromEntries(res.headers.entries()));
const text = await res.text();
console.log('Body:', text);
process.exit(0);
