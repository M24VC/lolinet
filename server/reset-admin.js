import { config } from './config.js';
import { db, initDb, closeDb } from './db.js';
import { hashPassword } from './auth.js';

initDb();

const username = (process.argv[2] || config.adminUsername || 'admin').trim();
const password = (process.argv[3] || config.adminInitPassword || 'admin123').trim();

const passwordHash = await hashPassword(password);

const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
if (existing) {
  db.prepare("UPDATE admin_users SET password_hash = ?, tfa_enabled = 0, tfa_secret = '' WHERE id = ?")
    .run(passwordHash, existing.id);
} else {
  db.prepare("INSERT INTO admin_users (username, password_hash, tfa_enabled, tfa_secret) VALUES (?, ?, 0, '')")
    .run(username, passwordHash);
}

console.log('----------------------------------------------------');
console.log('✓ LoliNet 管理員帳號已成功重置！');
console.log(`  使用者帳號 : ${username}`);
console.log(`  登入密碼   : ${password}`);
console.log('  2FA 驗證   : 已停用');
console.log('----------------------------------------------------');

closeDb();
