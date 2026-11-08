import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

const rawDbPath = process.env.DB_PATH || './data/lolinet.db';
const resolvedDbPath = path.isAbsolute(rawDbPath) ? rawDbPath : path.resolve(rootDir, rawDbPath);

export const config = {
  port: Number(process.env.PORT || 3000),
  dbPath: resolvedDbPath,
  sessionSecret: process.env.SESSION_SECRET || 'change-me-strong-secret',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminInitPassword: process.env.ADMIN_INIT_PASSWORD || 'admin123',
  rootDir
};
