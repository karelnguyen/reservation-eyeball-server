import 'dotenv/config';

import { execSync } from 'node:child_process';
import { config } from 'dotenv';

process.env.TZ = 'UTC';
config({ path: '.env.test', override: true });
// Apply schema to the Neon test branch.
// Prefer migrate deploy if you have migrations; fall back to db push otherwise.
// try {
//   execSync('npx prisma migrate deploy', { stdio: 'inherit' });
// } catch {
//   execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
// }
execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
