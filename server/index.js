import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { db, initDb, getState, saveSettings, saveLinks, savePluginState, resetAllState, getDefaultState, closeDb } from './db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  destroySession,
  destroySessionsForUser,
  createTfaChallenge,
  consumeTfaChallenge,
  SESSION_TTL_MS
} from './auth.js';
import { generateTfaSecret, buildOtpAuthUrl, verifyTfaToken } from './totp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = config.rootDir || path.resolve(__dirname, '..');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Block direct access to sensitive paths & files
const BLOCKED_EXTENSIONS = /\.(db|sqlite|sqlite3|sh|ini|env|log|bak|sql)$/i;

app.use((req, res, next) => {
  try {
    const rawPath = decodeURIComponent(req.path);
    const normalized = path.posix.normalize(rawPath).toLowerCase();

    // Block hidden files (starting with dot)
    if (normalized.split('/').some(segment => segment.startsWith('.'))) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    // Block sensitive directories
    if (
      normalized.startsWith('/data') ||
      normalized.startsWith('/server') ||
      normalized.startsWith('/node_modules')
    ) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    // Block sensitive extensions and package configs
    if (BLOCKED_EXTENSIONS.test(normalized) || /package(-lock)?\.json$/i.test(normalized)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
  } catch {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }
  next();
});

// CSRF check for state-mutating admin requests
app.use('/api/admin', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const host = req.headers.host;

    if (origin) {
      try {
        const originHost = new URL(origin).host;
        if (host && originHost !== host) {
          return res.status(403).json({ error: 'CSRF_DETECTED', message: '拒絕跨站請求' });
        }
      } catch {
        return res.status(400).json({ error: 'INVALID_ORIGIN' });
      }
    } else if (referer) {
      try {
        const refererHost = new URL(referer).host;
        if (host && refererHost !== host) {
          return res.status(403).json({ error: 'CSRF_DETECTED', message: '拒絕跨站請求' });
        }
      } catch {
        return res.status(400).json({ error: 'INVALID_REFERER' });
      }
    }
  }
  next();
});

initDb();

async function ensureAdminUser() {
  const row = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(config.adminUsername);
  if (row) return;

  const anyUser = db.prepare('SELECT id FROM admin_users LIMIT 1').get();
  if (!anyUser) {
    const passwordHash = await hashPassword(config.adminInitPassword);
    db.prepare("INSERT INTO admin_users (username, password_hash, tfa_enabled, tfa_secret) VALUES (?, ?, 0, '')")
      .run(config.adminUsername, passwordHash);
  }
}
await ensureAdminUser();

// In-memory rate limiter for brute-force protection
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return true;
  if (now > entry.resetAt) {
    loginAttempts.delete(ip);
    return true;
  }
  return entry.count < MAX_LOGIN_ATTEMPTS;
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + LOGIN_LOCKOUT_MS };
  entry.count++;
  if (now > entry.resetAt) {
    entry.resetAt = now + LOGIN_LOCKOUT_MS;
  }
  loginAttempts.set(ip, entry);
}

function resetLoginRateLimit(ip) {
  loginAttempts.delete(ip);
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip);
  }
}, 10 * 60 * 1000).unref();

function getClientIp(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function setSessionCookie(req, res, token) {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie('ln_admin_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
    path: '/',
    secure: isSecure
  });
}

function toClientSettings(settings) {
  const { pwd, security, ...publicSettings } = settings || {};
  return {
    ...publicSettings,
    security: { tfaEnabled: Boolean(security?.tfaEnabled) }
  };
}

function sanitizeText(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\r\n]+/g, ' ').trim().slice(0, maxLen);
}

function sanitizeUrl(str, defaultUrl = '') {
  if (typeof str !== 'string') return defaultUrl;
  let clean = str.replace(/[\r\n\t]+/g, '').trim();
  if (!clean) return defaultUrl;
  // Allow local uploaded assets in /assets/
  if (/^\/(assets|plugins)\/[a-zA-Z0-9_\-\.\/]+$/i.test(clean)) {
    return clean;
  }
  // Allow reasonable data URL images
  if (/^data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(clean) && clean.length < 500000) {
    return clean;
  }
  if (!/^https?:\/\//i.test(clean)) {
    clean = 'https://' + clean;
  }
  try {
    const parsed = new URL(clean);
    if (!['http:', 'https:'].includes(parsed.protocol)) return defaultUrl;
    return parsed.href;
  } catch {
    return defaultUrl;
  }
}

function sanitizeSettings(settings) {
  if (!settings || typeof settings !== 'object') return getState().settings;
  const current = getState().settings;
  const seoInput = (settings.seo && typeof settings.seo === 'object') ? settings.seo : (current.seo || {});

  const currentSiteUrl = current.seo?.siteUrl || 'https://m24vc.com/';

  return {
    title: sanitizeText(settings.title, 100) || current.title,
    sub: sanitizeText(settings.sub, 200) || current.sub,
    ava: sanitizeUrl(settings.ava, current.ava),
    author: sanitizeText(settings.author, 100) || current.author,
    security: { tfaEnabled: Boolean(current.security?.tfaEnabled) },
    seo: {
      siteUrl: sanitizeUrl(seoInput.siteUrl, currentSiteUrl),
      description: sanitizeText(seoInput.description, 500) || current.seo?.description || '',
      keywords: sanitizeText(seoInput.keywords, 500) || current.seo?.keywords || '',
      ogImage: sanitizeUrl(seoInput.ogImage, current.seo?.ogImage || current.ava),
      ogImageWidth: sanitizeText(seoInput.ogImageWidth, 10) || current.seo?.ogImageWidth || '512',
      ogImageHeight: sanitizeText(seoInput.ogImageHeight, 10) || current.seo?.ogImageHeight || '512',
      ogImageAlt: sanitizeText(seoInput.ogImageAlt, 200) || current.seo?.ogImageAlt || 'LoliNet 像素風格頭像',
      twitterCard: sanitizeText(seoInput.twitterCard, 50) || 'summary_large_image',
      themeColor: /^#[0-9a-fA-F]{3,8}$/.test(String(seoInput.themeColor || '').trim()) ? seoInput.themeColor.trim() : '#070712',
      robots: ['index, follow', 'noindex, nofollow', 'noindex, follow', 'index, nofollow'].includes(seoInput.robots)
        ? seoInput.robots
        : 'index, follow',
      canonical: sanitizeUrl(seoInput.canonical || seoInput.siteUrl, currentSiteUrl),
      favicon: sanitizeUrl(seoInput.favicon, current.seo?.favicon || current.ava)
    }
  };
}

function sanitizeLinkItem(item, idx) {
  if (!item || typeof item !== 'object') return null;
  const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 64) : 'lk_' + Date.now() + '_' + idx;
  const name = sanitizeText(item.name, 100) || '未命名連結';

  let rawUrl = typeof item.url === 'string' ? item.url.trim() : '';
  if (!rawUrl) return null;
  if (!/^https?:\/\//i.test(rawUrl)) {
    rawUrl = 'https://' + rawUrl;
  }
  let url = '';
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    url = parsed.href;
  } catch {
    return null;
  }

  const ico = typeof item.ico === 'string' ? item.ico.trim().slice(0, 30) : '🌸';
  const desc = typeof item.desc === 'string' ? item.desc.trim().slice(0, 500) : '';
  const cat = typeof item.cat === 'string' ? item.cat.trim().slice(0, 50) : '';
  const clr = typeof item.clr === 'string' && /^#([0-9a-fA-F]{3,8})$/.test(item.clr.trim()) ? item.clr.trim() : '#00ff88';

  return { id, name, url, ico, desc, cat, clr };
}

function requireAuth(req, res, next) {
  const token = req.cookies?.ln_admin_session;
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'UNAUTHORIZED' });
  req.session = session;
  next();
}

app.post('/api/admin/login', async (req, res, next) => {
  try {
    const clientIp = getClientIp(req);
    if (!checkLoginRateLimit(clientIp)) {
      return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', message: '嘗試次數過多，請於 5 分鐘後再試' });
    }

    const { username: rawUser, password } = req.body || {};
    const username = (typeof rawUser === 'string' && rawUser.trim()) ? rawUser.trim() : config.adminUsername;

    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'MISSING_CREDENTIALS', message: '請輸入登入密碼' });
    }

    let user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
    if (!user && username === 'admin') {
      user = db.prepare('SELECT * FROM admin_users LIMIT 1').get();
    }

    if (!user) {
      recordFailedLogin(clientIp);
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '帳號或密碼錯誤' });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      recordFailedLogin(clientIp);
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '密碼錯誤，請重試' });
    }

    if (user.tfa_enabled) {
      const challengeToken = createTfaChallenge(user.id, user.username);
      return res.json({ ok: true, requireTfa: true, challengeToken, username: user.username });
    }

    resetLoginRateLimit(clientIp);
    const token = createSession(user.id);
    setSessionCookie(req, res, token);
    return res.json({ ok: true, requireTfa: false });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/login/verify-2fa', (req, res, next) => {
  try {
    const clientIp = getClientIp(req);
    if (!checkLoginRateLimit(clientIp)) {
      return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', message: '嘗試次數過多，請於 5 分鐘後再試' });
    }

    const { challengeToken, token: tfaToken } = req.body || {};
    if (typeof challengeToken !== 'string' || !challengeToken.trim()) {
      return res.status(400).json({ error: 'MISSING_CHALLENGE', message: '缺少 2FA 授權票證，請重新登入' });
    }
    if (typeof tfaToken !== 'string' || !tfaToken.trim()) {
      return res.status(400).json({ error: 'MISSING_2FA_TOKEN', message: '請輸入 6 位數 2FA 驗證碼' });
    }

    const challenge = consumeTfaChallenge(challengeToken.trim());
    if (!challenge) {
      recordFailedLogin(clientIp);
      return res.status(401).json({ error: 'EXPIRED_OR_INVALID_CHALLENGE', message: '2FA 驗證票證已過期或無效，請重新輸入密碼登入' });
    }

    const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(challenge.userId);
    if (!user || !user.tfa_enabled || !user.tfa_secret) {
      recordFailedLogin(clientIp);
      return res.status(401).json({ error: 'INVALID_USER', message: '使用者不存在或未設定 2FA' });
    }

    const ok = verifyTfaToken(user.tfa_secret, tfaToken.trim());
    if (!ok) {
      recordFailedLogin(clientIp);
      return res.status(401).json({ error: 'INVALID_2FA', message: '2FA 驗證碼錯誤，請確認驗證器時間是否同步' });
    }

    resetLoginRateLimit(clientIp);
    const sessionToken = createSession(user.id);
    setSessionCookie(req, res, sessionToken);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.cookies?.ln_admin_session;
  destroySession(token);
  res.clearCookie('ln_admin_session', { path: '/' });
  res.json({ ok: true });
});

app.put('/api/admin/password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'MISSING_PASSWORD_PAYLOAD', message: '請提供目前密碼與新密碼' });
    }
    if (newPassword.length < 8 || newPassword.length > 256) {
      return res.status(400).json({ error: 'INVALID_PASSWORD_LENGTH', message: '新密碼長度需在 8 至 256 字元之間' });
    }

    const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.session.userId);
    if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '目前密碼不正確' });
    }

    const passwordHash = await hashPassword(newPassword);
    db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);
    destroySessionsForUser(user.id);
    const token = createSession(user.id);
    setSessionCookie(req, res, token);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get('/api/admin/settings', requireAuth, (_req, res) => {
  const state = getState();
  res.json(toClientSettings(state.settings));
});


app.post('/api/admin/upload', requireAuth, (req, res) => {
  try {
    const { data, filename, type } = req.body || {};
    if (!data || typeof data !== 'string') {
      return res.status(400).json({ error: 'MISSING_DATA', message: '未接收到圖片資料' });
    }

    const matches = data.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    let mimeType = 'png';
    let base64Data = data;

    if (matches) {
      mimeType = matches[1].toLowerCase();
      base64Data = matches[2];
    }

    const allowedExtensions = {
      'png': 'png',
      'jpeg': 'jpg',
      'jpg': 'jpg',
      'webp': 'webp',
      'gif': 'gif',
      'svg+xml': 'svg',
      'svg': 'svg',
      'x-icon': 'ico',
      'vnd.microsoft.icon': 'ico',
      'ico': 'ico'
    };

    const ext = allowedExtensions[mimeType] || 'png';
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > 8 * 1024 * 1024) {
      return res.status(400).json({ error: 'FILE_TOO_LARGE', message: '圖片檔案大小不能超過 8MB' });
    }

    const uploadsDir = path.join(rootDir, 'assets', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const prefix = type ? String(type).replace(/[^a-zA-Z0-9_-]/g, '') : 'img';
    const uniqueName = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = path.join(uploadsDir, uniqueName);

    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/assets/uploads/${uniqueName}`;
    res.json({ ok: true, url: publicUrl, filename: uniqueName });
  } catch (err) {
    console.error('[Upload error]', err);
    res.status(500).json({ error: 'UPLOAD_FAILED', message: '圖片上傳處理失敗' });
  }
});

app.put('/api/admin/settings', requireAuth, (req, res) => {
  saveSettings(sanitizeSettings(req.body));
  res.json({ ok: true });
});

app.get('/api/admin/links', requireAuth, (_req, res) => {
  const state = getState();
  res.json(state.links);
});

app.put('/api/admin/links', requireAuth, (req, res) => {
  const rawLinks = Array.isArray(req.body) ? req.body : [];
  const cleanLinks = rawLinks.map(sanitizeLinkItem).filter(Boolean);
  saveLinks(cleanLinks);
  res.json({ ok: true, count: cleanLinks.length });
});

app.get('/api/admin/plugins/state', requireAuth, (_req, res) => {
  const state = getState();
  res.json(state.pluginState);
});

app.put('/api/admin/plugins/state', requireAuth, (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  savePluginState(payload);
  res.json({ ok: true });
});

app.post('/api/admin/reset-all', requireAuth, async (req, res, next) => {
  try {
    resetAllState();
    const passwordHash = await hashPassword(config.adminInitPassword);
    db.prepare("UPDATE admin_users SET password_hash = ?, tfa_enabled = 0, tfa_secret = '' WHERE id = ?")
      .run(passwordHash, req.session.userId);
    destroySessionsForUser(req.session.userId);
    res.clearCookie('ln_admin_session', { path: '/' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/2fa/generate', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.session.userId);
  const secret = generateTfaSecret();
  const otpAuthUrl = buildOtpAuthUrl(secret, user.username, 'LoliNet');
  // Store in active session rather than destroying active 2FA in DB
  req.session.pendingTfaSecret = secret;
  res.json({ secret, otpAuthUrl });
});

app.post('/api/admin/2fa/enable', requireAuth, (req, res) => {
  const { token } = req.body || {};
  if (typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'MISSING_TOKEN', message: '請輸入 6 位數 2FA 驗證碼' });
  }
  const pendingSecret = req.session.pendingTfaSecret;
  if (!pendingSecret) {
    return res.status(400).json({ error: 'NO_SECRET', message: '請先點擊「產生新密鑰」' });
  }
  const ok = verifyTfaToken(pendingSecret, token.trim());
  if (!ok) {
    return res.status(401).json({ error: 'INVALID_2FA', message: '2FA 驗證碼不正確，請確認時間是否同步' });
  }

  db.prepare('UPDATE admin_users SET tfa_secret = ?, tfa_enabled = 1 WHERE id = ?')
    .run(pendingSecret, req.session.userId);
  delete req.session.pendingTfaSecret;

  const state = getState();
  const s = state.settings;
  if (!s.security) s.security = {};
  s.security.tfaEnabled = true;
  saveSettings(s);

  res.json({ ok: true });
});

app.post('/api/admin/2fa/disable', requireAuth, (req, res) => {
  const { token } = req.body || {};
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.session.userId);

  if (user && user.tfa_enabled) {
    const code = String(token || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'MISSING_TOKEN', message: '停用 2FA 需要提供目前驗證碼' });
    }
    const ok = verifyTfaToken(user.tfa_secret, code);
    if (!ok) {
      return res.status(401).json({ error: 'INVALID_2FA', message: '2FA 驗證碼不正確' });
    }
  }

  db.prepare("UPDATE admin_users SET tfa_enabled = 0, tfa_secret = '' WHERE id = ?").run(req.session.userId);
  delete req.session.pendingTfaSecret;

  const state = getState();
  const s = state.settings;
  if (!s.security) s.security = {};
  s.security.tfaEnabled = false;
  saveSettings(s);

  res.json({ ok: true });
});

app.get('/api/public/state', (_req, res) => {
  const state = getState();
  res.json({ settings: toClientSettings(state.settings), links: state.links });
});

// Static assets (cache 1 day)
app.use('/assets', express.static(path.join(rootDir, 'assets'), {
  maxAge: '1d',
  index: false
}));

// Plugins (cache 1 hour)
app.use('/plugins', express.static(path.join(rootDir, 'plugins'), {
  maxAge: '1h',
  index: false
}));

function escapeXml(unsafe) {
  return String(unsafe || '').replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function escapeHtml(unsafe) {
  return String(unsafe || '').replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&#39;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// Dynamic Robots.txt and Sitemap.xml based on current siteUrl settings
app.get('/robots.txt', (_req, res) => {
  const { settings } = getState();
  const rawUrl = settings?.seo?.siteUrl || 'https://m24vc.com';
  const siteUrl = sanitizeUrl(rawUrl, 'https://m24vc.com').replace(/\/+$/, '');
  const robotsSetting = settings?.seo?.robots || 'index, follow';

  res.type('text/plain');
  if (robotsSetting.includes('noindex')) {
    res.send(`User-agent: *\nDisallow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
  } else {
    let txt = `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\n`;
    txt += `# AI Search Engines & Retrieval Crawlers\n`;
    txt += `User-agent: OAI-SearchBot\nAllow: /\n\n`;
    txt += `User-agent: Claude-SearchBot\nAllow: /\n\n`;
    txt += `User-agent: PerplexityBot\nAllow: /\n\n`;
    txt += `Sitemap: ${siteUrl}/sitemap.xml\n`;
    res.send(txt);
  }
});

// Machine-readable surface for AI / LLM search & answer engines
app.get('/llms.txt', (_req, res) => {
  const { settings, links } = getState();
  const rawUrl = settings?.seo?.siteUrl || 'https://m24vc.com';
  const siteUrl = sanitizeUrl(rawUrl, 'https://m24vc.com').replace(/\/+$/, '');
  const title = settings?.title || 'LoliNet';
  const desc = settings?.seo?.description || '賽博龐克風格個人導覽站，收錄開發工具、博客、媒體等精選站點。';

  const categories = [...new Set((links || []).map(l => l.cat).filter(Boolean))];

  let md = `# ${title} // 個人導覽站\n\n`;
  md += `> ${desc}\n\n`;
  md += `Official URL: ${siteUrl}/\n\n`;
  md += `## 導覽分類頻道 (Categories)\n`;
  categories.forEach(cat => {
    md += `- [${cat}](${siteUrl}/?cat=${encodeURIComponent(cat)})\n`;
  });
  md += `\n## 精選節點資源清單 (Curated Developer & Web Resources)\n`;
  (links || []).forEach(l => {
    md += `- [${l.name}](${l.url}): ${l.desc || '無描述'} [分類: ${l.cat || '未分類'}]\n`;
  });

  res.type('text/markdown; charset=utf-8');
  res.send(md);
});

app.get('/sitemap.xml', (_req, res) => {
  const { settings, links } = getState();
  const rawUrl = settings?.seo?.siteUrl || 'https://m24vc.com';
  const siteUrl = escapeXml(sanitizeUrl(rawUrl, 'https://m24vc.com').replace(/\/+$/, ''));
  const today = new Date().toISOString().split('T')[0];

  const categories = [...new Set((links || []).map(l => l.cat).filter(Boolean))];
  const categoryUrls = categories.map(cat => `
  <url>
    <loc>${siteUrl}/?cat=${encodeURIComponent(cat)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>${categoryUrls}
</urlset>`);
});

// Frontends
app.get('/admin*', (_req, res) => res.sendFile(path.join(rootDir, 'admin', 'index.html')));

function safeColor(value) {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(value || '').trim()) ? value.trim() : '#ff6eb4';
}

function renderServerCards(links) {
  if (!links || !links.length) {
    return '<div class="empty" role="listitem"><div style="font-size:2em;margin-bottom:8px">✧</div><div style="color:var(--pink)">沒有找到站點節點</div></div>';
  }
  return links.map((lk, i) => {
    const href = lk.url;
    if (!href) return '';
    const color = safeColor(lk.clr);
    const name = escapeHtml(lk.name || '未命名節點');
    const desc = escapeHtml(lk.desc || '');
    const cat = escapeHtml(lk.cat || '');
    const ico = escapeHtml(lk.ico || '🌸');
    const ariaLabel = escapeHtml(lk.name + (lk.desc ? ' - ' + lk.desc : ''));
    const delay = (i * 0.04).toFixed(2);

    return `
    <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="card" role="listitem" aria-label="${ariaLabel}" style="border-color:${color};animation-delay:${delay}s">
      <div class="c-corner c-tl" aria-hidden="true"></div>
      <div class="c-corner c-br" aria-hidden="true"></div>
      <div class="c-head">
        <span class="c-ico" style="color:${color}" aria-hidden="true">${ico}</span>
        <div>
          <div class="c-name" style="color:${color}">${name}</div>
          <div class="c-url">${escapeHtml(href)}</div>
        </div>
      </div>
      ${desc ? `<div class="c-desc">${desc}</div>` : ''}
      ${cat ? `<span class="c-tag" style="color:${color};border-color:${color}55">${cat}</span>` : ''}
    </a>`;
  }).join('');
}

function renderServerCats(allCats, activeCat) {
  const isAll = !activeCat || activeCat === 'all';
  let html = `<button class="cat-btn ${isAll ? 'on' : ''}" role="tab" aria-selected="${isAll ? 'true' : 'false'}" aria-controls="grid" tabindex="${isAll ? '0' : '-1'}" id="tab-all" onclick="filter('all')">ALL ✦</button>`;
  allCats.forEach((ct) => {
    const on = activeCat === ct;
    html += `<button class="cat-btn ${on ? 'on' : ''}" role="tab" aria-selected="${on ? 'true' : 'false'}" aria-controls="grid" tabindex="${on ? '0' : '-1'}" id="tab-${escapeHtml(ct)}" onclick="filter('${escapeHtml(ct)}')">${escapeHtml(ct.toUpperCase())}</button>`;
  });
  return html;
}

function renderIndexWithSeo(html, settings, links = [], requestedCat = null) {
  const s = settings || {};
  const seo = s.seo || {};
  const baseTitle = escapeHtml(s.title || 'LoliNet');
  const baseDesc = escapeHtml(seo.description || 'LoliNet - 賽博龐克風格個人導覽站，收錄開發工具、博客、媒體等精選站點。');
  const keywords = escapeHtml(seo.keywords || '個人導覽站, 書籤, 導航, 賽博龐克, 網站收藏, 工具箱, 二次元, 技術博客');
  const robots = escapeHtml(seo.robots || 'index, follow');
  const themeColor = escapeHtml(seo.themeColor || '#070712');
  const siteUrl = escapeHtml((seo.siteUrl || 'https://m24vc.com/').replace(/\/+$/, '') + '/');
  const ogImage = escapeHtml(seo.ogImage || s.ava || '');
  const ogAlt = escapeHtml(seo.ogImageAlt || `${baseTitle} 像素風格頭像`);
  const favicon = escapeHtml(seo.favicon || s.ava || '');

  // Filter links for category if specified
  const allCats = [...new Set(links.map(l => l.cat).filter(Boolean))];
  const isFiltered = requestedCat && requestedCat !== 'all' && allCats.includes(requestedCat);
  const activeCat = isFiltered ? requestedCat : 'all';
  const displayLinks = isFiltered ? links.filter(l => l.cat === requestedCat) : links;

  const pageTitle = isFiltered ? `${escapeHtml(requestedCat)} 精選站點導覽 - ${baseTitle} // 個人導覽站` : `${baseTitle} // 個人導覽站`;
  const pageDesc = isFiltered ? `收錄 ${escapeHtml(requestedCat)} 相關精選開發工具、網站與服務 - ${baseDesc}` : baseDesc;
  const canonicalUrl = isFiltered ? `${siteUrl}?cat=${encodeURIComponent(requestedCat)}` : siteUrl;

  let out = html;

  // Head Meta replacements
  out = out.replace(/<title>.*?<\/title>/i, `<title>${pageTitle}<\/title>`);
  out = out.replace(/<meta name="description" content=".*?"\/?>/i, `<meta name="description" content="${pageDesc}">`);
  out = out.replace(/<meta name="keywords" content=".*?"\/?>/i, `<meta name="keywords" content="${keywords}">`);
  out = out.replace(/<meta name="robots" content=".*?"\/?>/i, `<meta name="robots" content="${robots}">`);
  out = out.replace(/<meta name="theme-color" content=".*?"\/?>/i, `<meta name="theme-color" content="${themeColor}">`);

  out = out.replace(/<meta property="og:title" content=".*?"\/?>/i, `<meta property="og:title" content="${pageTitle}">`);
  out = out.replace(/<meta property="og:description" content=".*?"\/?>/i, `<meta property="og:description" content="${pageDesc}">`);
  out = out.replace(/<meta property="og:url" content=".*?"\/?>/i, `<meta property="og:url" content="${canonicalUrl}">`);
  out = out.replace(/<meta property="og:image" content=".*?"\/?>/i, `<meta property="og:image" content="${ogImage}">`);
  out = out.replace(/<meta property="og:image:alt" content=".*?"\/?>/i, `<meta property="og:image:alt" content="${ogAlt}">`);

  out = out.replace(/<meta name="twitter:title" content=".*?"\/?>/i, `<meta name="twitter:title" content="${pageTitle}">`);
  out = out.replace(/<meta name="twitter:description" content=".*?"\/?>/i, `<meta name="twitter:description" content="${pageDesc}">`);
  out = out.replace(/<meta name="twitter:image" content=".*?"\/?>/i, `<meta name="twitter:image" content="${ogImage}">`);

  out = out.replace(/<link rel="canonical" href=".*?"\/?>/i, `<link rel="canonical" href="${canonicalUrl}">`);
  out = out.replace(/<link rel="icon"[^>]*href=".*?"\/?>/i, `<link rel="icon" type="image/svg+xml" href="${favicon}">`);
  out = out.replace(/<link rel="apple-touch-icon"[^>]*href=".*?"\/?>/i, `<link rel="apple-touch-icon" href="${favicon}">`);

  // Rich JSON-LD Structured Data: WebSite + CollectionPage + ItemList
  const schemaItemList = displayLinks.map((lk, idx) => ({
    "@type": "ListItem",
    "position": idx + 1,
    "name": lk.name || '未命名節點',
    "url": lk.url,
    "description": lk.desc || undefined
  }));

  const jsonLdGraph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "name": s.title || 'LoliNet',
        "alternateName": (s.title || 'LoliNet') + " 個人導覽站",
        "url": siteUrl,
        "description": baseDesc,
        "potentialAction": {
          "@type": "SearchAction",
          "target": {
            "@type": "EntryPoint",
            "urlTemplate": siteUrl + "?q={search_term_string}"
          },
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": "CollectionPage",
        "name": pageTitle,
        "url": canonicalUrl,
        "description": pageDesc,
        "mainEntity": {
          "@type": "ItemList",
          "name": (isFiltered ? requestedCat : '全部') + " 精選導覽節點清單",
          "numberOfItems": displayLinks.length,
          "itemListElement": schemaItemList
        }
      }
    ]
  };

  out = out.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/i,
    `<script type="application/ld+json">\n${JSON.stringify(jsonLdGraph, null, 2)}\n</script>`
  );

  // SSR Body Injections: Grid cards & Categories
  const serverGridHtml = renderServerCards(displayLinks);
  out = out.replace('<div class="grid" id="grid" role="list"></div>', `<div class="grid" id="grid" role="list">${serverGridHtml}</div>`);

  const serverCatsHtml = renderServerCats(allCats, activeCat);
  out = out.replace('<div class="cats" id="cats" role="tablist" aria-label="分類篩選"></div>', `<div class="cats" id="cats" role="tablist" aria-label="分類篩選">${serverCatsHtml}</div>`);

  // Update counts
  out = out.replace('<span id="nodecnt">0 NODES</span>', `<span id="nodecnt">${links.length} NODES</span>`);
  out = out.replace('<span id="result-count">0 / 0 SIGNALS</span>', `<span id="result-count">${displayLinks.length} / ${links.length} SIGNALS</span>`);
  out = out.replace('<span id="active-filter">ALL CHANNELS</span>', `<span id="active-filter">${isFiltered ? escapeHtml(requestedCat.toUpperCase()) : 'ALL CHANNELS'}</span>`);

  return out;
}

app.get(['/', '/index.html'], (req, res, next) => {
  const indexPath = path.join(rootDir, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, content) => {
    if (err) return next(err);
    try {
      const { settings, links } = getState();
      const requestedCat = typeof req.query.cat === 'string' ? req.query.cat.trim() : null;
      const rendered = renderIndexWithSeo(content, settings, links, requestedCat);
      res.type('text/html');
      res.send(rendered);
    } catch {
      res.sendFile(indexPath);
    }
  });
});

// API 404
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' });
});

// Global 404 fallback
app.use((_req, res) => {
  res.status(404).send('Not Found');
});

// Global Error Handler
app.use((err, _req, res, _next) => {
  console.error('[LoliNet] Server error:', err);
  res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
});

const server = app.listen(config.port, () => {
  const { DEF_SET, DEF_LINKS } = getDefaultState();
  console.log(`[LoliNet] Server running at http://localhost:${config.port}`);
  console.log(`[LoliNet] Default title: ${DEF_SET.title}, default links: ${DEF_LINKS.length}`);
  console.log(`[LoliNet] Database path: ${config.dbPath}`);
});

function gracefulShutdown(signal) {
  console.log(`\n[LoliNet] Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    closeDb();
    console.log('[LoliNet] Server stopped cleanly.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[LoliNet] Forced exit due to shutdown timeout.');
    process.exit(1);
  }, 3000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
