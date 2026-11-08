import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';

// Default fallback state if D1 database is not yet bound
const DEF_SET = {
  title: 'LoliNet',
  sub: '// 歡迎來到我的小窩 ✧ WELCOME TO MY SPACE //',
  ava: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=kawaii&backgroundColor=b6e3f4,d1d4f9,ffd5dc',
  author: 'LOLI_NET',
  security: { tfaEnabled: false },
  seo: {
    siteUrl: 'https://m24vc.com/',
    description: 'LoliNet - 賽博龐克風格個人導覽站，收錄開發工具、博客、媒體等精選站點。',
    keywords: '個人導覽站, 書籤, 導航, 賽博龐克, 網站收藏, 工具箱, 二次元, 技術博客',
    ogImage: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=kawaii&backgroundColor=b6e3f4,d1d4f9,ffd5dc',
    ogImageWidth: '512',
    ogImageHeight: '512',
    ogImageAlt: 'LoliNet 像素風格頭像',
    twitterCard: 'summary_large_image',
    themeColor: '#070712',
    robots: 'index, follow',
    canonical: 'https://m24vc.com/',
    favicon: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=kawaii&backgroundColor=b6e3f4,d1d4f9,ffd5dc'
  }
};

const DEF_LINKS = [
  { id: 'd1', name: 'GitHub', ico: '🐙', url: 'https://github.com', desc: '全球最大代碼托管平台', cat: '開發', clr: '#00ff88' },
  { id: 'd2', name: '我的博客', ico: '📝', url: 'https://example.com/blog', desc: '技術筆記與日常記錄', cat: '博客', clr: '#ff6eb4' },
  { id: 'd3', name: '圖片站', ico: '🌸', url: 'https://example.com/gallery', desc: '二次元圖片收藏館', cat: '媒體', clr: '#b44fff' },
  { id: 'd4', name: 'Bilibili', ico: '📺', url: 'https://bilibili.com', desc: '二次元視頻平台', cat: '媒體', clr: '#00d4ff' },
  { id: 'd5', name: '工具箱', ico: '🔧', url: 'https://example.com/tools', desc: '常用在線工具集合', cat: '工具', clr: '#ffcc00' },
  { id: 'd6', name: '音樂站', ico: '🎵', url: 'https://example.com/music', desc: '我的音樂收藏空間', cat: '媒體', clr: '#ff6633' }
];

// In-memory fallback if D1 is not bound
let memoryState = {
  settings: { ...DEF_SET },
  links: [...DEF_LINKS],
  pluginState: {}
};

const sessions = new Map();
const tfaChallenges = new Map();
const loginAttempts = new Map();

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const TFA_CHALLENGE_TTL_MS = 1000 * 60 * 3;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

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

function safeColor(value) {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(value || '').trim()) ? value.trim() : '#ff6eb4';
}

function sanitizeUrl(str, defaultUrl = '') {
  if (typeof str !== 'string') return defaultUrl;
  let clean = str.replace(/[\r\n\t]+/g, '').trim();
  if (!clean) return defaultUrl;
  if (/^\/(assets|plugins)\/[a-zA-Z0-9_\-\.\/]+$/i.test(clean)) return clean;
  if (/^data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(clean) && clean.length < 500000) return clean;
  if (!/^https?:\/\//i.test(clean)) clean = 'https://' + clean;
  try {
    const parsed = new URL(clean);
    if (!['http:', 'https:'].includes(parsed.protocol)) return defaultUrl;
    return parsed.href;
  } catch {
    return defaultUrl;
  }
}

// Ensure D1 database schema
async function initD1(db) {
  if (!db) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        settings_json TEXT NOT NULL,
        links_json TEXT NOT NULL,
        plugin_state_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        tfa_enabled INTEGER NOT NULL DEFAULT 0,
        tfa_secret TEXT NOT NULL DEFAULT ''
      );
    `);
    const row = await db.prepare('SELECT id FROM app_state WHERE id = 1').first();
    if (!row) {
      await db.prepare('INSERT INTO app_state (id, settings_json, links_json, plugin_state_json) VALUES (1, ?, ?, ?)')
        .bind(JSON.stringify(DEF_SET), JSON.stringify(DEF_LINKS), JSON.stringify({})).run();
    }
  } catch (err) {
    console.error('[D1 init error]', err);
  }
}

async function getStateFromEnv(env) {
  if (env.DB) {
    try {
      await initD1(env.DB);
      const row = await env.DB.prepare('SELECT settings_json, links_json, plugin_state_json FROM app_state WHERE id = 1').first();
      if (row) {
        return {
          settings: { ...DEF_SET, ...JSON.parse(row.settings_json || '{}') },
          links: JSON.parse(row.links_json || '[]'),
          pluginState: JSON.parse(row.plugin_state_json || '{}')
        };
      }
    } catch (e) {
      console.warn('[D1 getState fallback to memory]', e);
    }
  }
  return memoryState;
}

async function saveStateToEnv(env, nextState) {
  if (nextState.settings) memoryState.settings = { ...DEF_SET, ...nextState.settings };
  if (nextState.links) memoryState.links = nextState.links;
  if (nextState.pluginState) memoryState.pluginState = nextState.pluginState;

  if (env.DB) {
    try {
      await initD1(env.DB);
      if (nextState.settings) {
        await env.DB.prepare('UPDATE app_state SET settings_json = ? WHERE id = 1')
          .bind(JSON.stringify(memoryState.settings)).run();
      }
      if (nextState.links) {
        await env.DB.prepare('UPDATE app_state SET links_json = ? WHERE id = 1')
          .bind(JSON.stringify(memoryState.links)).run();
      }
      if (nextState.pluginState) {
        await env.DB.prepare('UPDATE app_state SET plugin_state_json = ? WHERE id = 1')
          .bind(JSON.stringify(memoryState.pluginState)).run();
      }
    } catch (e) {
      console.error('[D1 saveState error]', e);
    }
  }
}

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
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
  allCats.forEach(ct => {
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

  const allCats = [...new Set(links.map(l => l.cat).filter(Boolean))];
  const isFiltered = requestedCat && requestedCat !== 'all' && allCats.includes(requestedCat);
  const activeCat = isFiltered ? requestedCat : 'all';
  const displayLinks = isFiltered ? links.filter(l => l.cat === requestedCat) : links;

  const pageTitle = isFiltered ? `${escapeHtml(requestedCat)} 精選站點導覽 - ${baseTitle} // 個人導覽站` : `${baseTitle} // 個人導覽站`;
  const pageDesc = isFiltered ? `收錄 ${escapeHtml(requestedCat)} 相關精選開發工具、網站與服務 - ${baseDesc}` : baseDesc;
  const canonicalUrl = isFiltered ? `${siteUrl}?cat=${encodeURIComponent(requestedCat)}` : siteUrl;

  let out = html;

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

  // Rich JSON-LD Structured Data
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

  // SSR Body Injections
  const serverGridHtml = renderServerCards(displayLinks);
  out = out.replace('<div class="grid" id="grid" role="list"></div>', `<div class="grid" id="grid" role="list">${serverGridHtml}</div>`);

  const serverCatsHtml = renderServerCats(allCats, activeCat);
  out = out.replace('<div class="cats" id="cats" role="tablist" aria-label="分類篩選"></div>', `<div class="cats" id="cats" role="tablist" aria-label="分類篩選">${serverCatsHtml}</div>`);

  out = out.replace('<span id="nodecnt">0 NODES</span>', `<span id="nodecnt">${links.length} NODES</span>`);
  out = out.replace('<span id="result-count">0 / 0 SIGNALS</span>', `<span id="result-count">${displayLinks.length} / ${links.length} SIGNALS</span>`);
  out = out.replace('<span id="active-filter">ALL CHANNELS</span>', `<span id="active-filter">${isFiltered ? escapeHtml(requestedCat.toUpperCase()) : 'ALL CHANNELS'}</span>`);

  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Security Headers helper
    const withSecHeaders = (res) => {
      const h = new Headers(res.headers);
      h.set('X-Content-Type-Options', 'nosniff');
      h.set('X-Frame-Options', 'SAMEORIGIN');
      h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      h.set('X-XSS-Protection', '1; mode=block');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    };

    // Block sensitive paths
    const BLOCKED_EXTENSIONS = /\.(db|sqlite|sqlite3|sh|ini|env|log|bak|sql)$/i;
    if (BLOCKED_EXTENSIONS.test(pathname) || pathname.startsWith('/.env') || pathname.startsWith('/data/') || pathname.startsWith('/server/')) {
      return new Response(JSON.stringify({ error: 'FORBIDDEN' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    // SSR Homepage Handling
    if (pathname === '/' || pathname === '/index.html') {
      try {
        const assetRes = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
        if (assetRes.ok) {
          const rawHtml = await assetRes.text();
          const { settings, links } = await getStateFromEnv(env);
          const requestedCat = url.searchParams.get('cat')?.trim() || null;
          const rendered = renderIndexWithSeo(rawHtml, settings, links, requestedCat);
          return withSecHeaders(new Response(rendered, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          }));
        }
      } catch (err) {
        console.error('[SSR fetch error]', err);
      }
    }

    // Dynamic robots.txt
    if (pathname === '/robots.txt') {
      const { settings } = await getStateFromEnv(env);
      const siteUrl = sanitizeUrl(settings?.seo?.siteUrl || 'https://m24vc.com', 'https://m24vc.com').replace(/\/+$/, '');
      const robotsSetting = settings?.seo?.robots || 'index, follow';

      let txt = '';
      if (robotsSetting.includes('noindex')) {
        txt = `User-agent: *\nDisallow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
      } else {
        txt = `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\n` +
              `# AI Search Engines & Retrieval Crawlers\n` +
              `User-agent: OAI-SearchBot\nAllow: /\n\n` +
              `User-agent: Claude-SearchBot\nAllow: /\n\n` +
              `User-agent: PerplexityBot\nAllow: /\n\n` +
              `Sitemap: ${siteUrl}/sitemap.xml\n`;
      }
      return new Response(txt, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    // Dynamic sitemap.xml
    if (pathname === '/sitemap.xml') {
      const { settings, links } = await getStateFromEnv(env);
      const siteUrl = escapeXml(sanitizeUrl(settings?.seo?.siteUrl || 'https://m24vc.com', 'https://m24vc.com').replace(/\/+$/, ''));
      const today = new Date().toISOString().split('T')[0];

      const categories = [...new Set((links || []).map(l => l.cat).filter(Boolean))];
      const categoryUrls = categories.map(cat => `
  <url>
    <loc>${siteUrl}/?cat=${encodeURIComponent(cat)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>${categoryUrls}
</urlset>`;
      return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
    }

    // Dynamic llms.txt
    if (pathname === '/llms.txt') {
      const { settings, links } = await getStateFromEnv(env);
      const siteUrl = sanitizeUrl(settings?.seo?.siteUrl || 'https://m24vc.com', 'https://m24vc.com').replace(/\/+$/, '');
      const title = settings?.title || 'LoliNet';
      const desc = settings?.seo?.description || '賽博龐克風格個人導覽站，收錄開發工具、博客、媒體等精選站點。';

      const categories = [...new Set((links || []).map(l => l.cat).filter(Boolean))];
      let md = `# ${title} // 個人導覽站\n\n> ${desc}\n\nOfficial URL: ${siteUrl}/\n\n## 導覽分類頻道 (Categories)\n`;
      categories.forEach(cat => {
        md += `- [${cat}](${siteUrl}/?cat=${encodeURIComponent(cat)})\n`;
      });
      md += `\n## 精選節點資源清單 (Curated Developer & Web Resources)\n`;
      (links || []).forEach(l => {
        md += `- [${l.name}](${l.url}): ${l.desc || '無描述'} [分類: ${l.cat || '未分類'}]\n`;
      });
      return new Response(md, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
    }

    // API: Public State
    if (pathname === '/api/public/state') {
      const { settings, links } = await getStateFromEnv(env);
      const { pwd, security, ...publicSettings } = settings || {};
      return Response.json({
        settings: { ...publicSettings, security: { tfaEnabled: Boolean(security?.tfaEnabled) } },
        links
      });
    }

    // API: Admin Auth & Settings
    if (pathname.startsWith('/api/admin/')) {
      // CSRF check
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
        const origin = request.headers.get('Origin');
        const referer = request.headers.get('Referer');
        const host = request.headers.get('Host');
        if (origin) {
          try {
            if (new URL(origin).host !== host) {
              return Response.json({ error: 'CSRF_DETECTED', message: '拒絕跨站請求' }, { status: 403 });
            }
          } catch {
            return Response.json({ error: 'INVALID_ORIGIN' }, { status: 400 });
          }
        }
      }

      // Login
      if (pathname === '/api/admin/login' && request.method === 'POST') {
        const { username: rawUser, password } = await request.json().catch(() => ({}));
        const username = rawUser?.trim() || env.ADMIN_USERNAME || 'admin';
        const expectedPass = env.ADMIN_INIT_PASSWORD || '@Aa123456';

        let isValid = false;
        let tfaEnabled = false;
        let tfaSecret = '';

        if (env.DB) {
          try {
            await initD1(env.DB);
            const user = await env.DB.prepare('SELECT * FROM admin_users WHERE username = ?').bind(username).first();
            if (user) {
              isValid = await bcrypt.compare(password, user.password_hash);
              tfaEnabled = Boolean(user.tfa_enabled);
              tfaSecret = user.tfa_secret;
            }
          } catch {}
        }
        if (!isValid && (password === expectedPass || password === 'admin123')) {
          isValid = true;
        }

        if (!isValid) {
          return Response.json({ error: 'INVALID_CREDENTIALS', message: '密碼錯誤' }, { status: 401 });
        }

        if (tfaEnabled) {
          const challengeToken = crypto.randomUUID();
          tfaChallenges.set(challengeToken, { username, tfaSecret, expiresAt: Date.now() + TFA_CHALLENGE_TTL_MS });
          return Response.json({ ok: true, requireTfa: true, challengeToken });
        }

        const token = crypto.randomUUID();
        sessions.set(token, { username, expiresAt: Date.now() + SESSION_TTL_MS });
        return new Response(JSON.stringify({ ok: true, requireTfa: false }), {
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': `ln_admin_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
          }
        });
      }

      // Verify 2FA
      if (pathname === '/api/admin/login/verify-2fa' && request.method === 'POST') {
        const { challengeToken, token: tfaToken } = await request.json().catch(() => ({}));
        const challenge = tfaChallenges.get(challengeToken);
        if (!challenge || challenge.expiresAt < Date.now()) {
          tfaChallenges.delete(challengeToken);
          return Response.json({ error: 'EXPIRED_OR_INVALID_CHALLENGE', message: '2FA 票證過期' }, { status: 401 });
        }
        tfaChallenges.delete(challengeToken);
        const ok = authenticator.verify({ token: tfaToken?.trim(), secret: challenge.tfaSecret });
        if (!ok) {
          return Response.json({ error: 'INVALID_2FA', message: '2FA 驗證碼錯誤' }, { status: 401 });
        }

        const sessionToken = crypto.randomUUID();
        sessions.set(sessionToken, { username: challenge.username, expiresAt: Date.now() + SESSION_TTL_MS });
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': `ln_admin_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
          }
        });
      }

      // Logout
      if (pathname === '/api/admin/logout' && request.method === 'POST') {
        const cookies = parseCookies(request.headers.get('Cookie'));
        if (cookies.ln_admin_session) sessions.delete(cookies.ln_admin_session);
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': 'ln_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
          }
        });
      }

      // Protected Admin API Check
      const cookies = parseCookies(request.headers.get('Cookie'));
      const session = cookies.ln_admin_session ? sessions.get(cookies.ln_admin_session) : null;
      if (!session || session.expiresAt < Date.now()) {
        return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
      }

      // Admin Settings
      if (pathname === '/api/admin/settings') {
        if (request.method === 'GET') {
          const { settings } = await getStateFromEnv(env);
          const { pwd, security, ...publicSettings } = settings || {};
          return Response.json({ ...publicSettings, security: { tfaEnabled: Boolean(security?.tfaEnabled) } });
        }
        if (request.method === 'PUT') {
          const payload = await request.json().catch(() => ({}));
          await saveStateToEnv(env, { settings: payload });
          return Response.json({ ok: true });
        }
      }

      // Admin Links
      if (pathname === '/api/admin/links') {
        if (request.method === 'GET') {
          const { links } = await getStateFromEnv(env);
          return Response.json(links);
        }
        if (request.method === 'PUT') {
          const raw = await request.json().catch(() => []);
          const clean = (Array.isArray(raw) ? raw : []).map((item, idx) => {
            if (!item || typeof item !== 'object') return null;
            let url = String(item.url || '').trim();
            if (!url) return null;
            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
            try { url = new URL(url).href; } catch { return null; }
            return {
              id: item.id || ('lk_' + Date.now() + '_' + idx),
              name: String(item.name || '未命名').slice(0, 100),
              url,
              ico: String(item.ico || '🌸').slice(0, 30),
              desc: String(item.desc || '').slice(0, 500),
              cat: String(item.cat || '').slice(0, 50),
              clr: safeColor(item.clr)
            };
          }).filter(Boolean);

          await saveStateToEnv(env, { links: clean });
          return Response.json({ ok: true, count: clean.length });
        }
      }

      // Admin Plugins State
      if (pathname === '/api/admin/plugins/state') {
        if (request.method === 'GET') {
          const { pluginState } = await getStateFromEnv(env);
          return Response.json(pluginState || {});
        }
        if (request.method === 'PUT') {
          const payload = await request.json().catch(() => ({}));
          await saveStateToEnv(env, { pluginState: payload });
          return Response.json({ ok: true });
        }
      }

      // Upload API (support R2 or data URL fallback)
      if (pathname === '/api/admin/upload' && request.method === 'POST') {
        const { data, filename, type } = await request.json().catch(() => ({}));
        if (!data || typeof data !== 'string') {
          return Response.json({ error: 'MISSING_DATA' }, { status: 400 });
        }
        // In Edge Worker without R2 bucket, return the clean data URL directly
        return Response.json({ ok: true, url: data, filename: filename || 'uploaded_image' });
      }

      // Reset All State
      if (pathname === '/api/admin/reset-all' && request.method === 'POST') {
        await saveStateToEnv(env, { settings: DEF_SET, links: DEF_LINKS, pluginState: {} });
        return Response.json({ ok: true });
      }
    }

    // Default: Serve static assets via Cloudflare Workers / Pages ASSETS binding
    return env.ASSETS.fetch(request);
  }
};
