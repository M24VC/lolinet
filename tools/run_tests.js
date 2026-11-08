import { db, initDb, getState, resetAllState, closeDb } from '../server/db.js';
import { config } from '../server/config.js';
import { authenticator } from 'otplib';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

initDb();

const PORT = 8956;
const BASE_URL = 'http://127.0.0.1:' + PORT;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let cookies = '';

async function req(path, opts = {}) {
  const url = BASE_URL + path;
  const headers = { ...(opts.headers || {}) };
  if (cookies && !headers['Cookie'] && !headers['cookie']) {
    headers['Cookie'] = cookies;
  }
  const res = await fetch(url, { ...opts, headers });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const parts = setCookie.split(';')[0];
    cookies = parts;
  }
  let body;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    body = await res.json().catch(() => null);
  } else {
    body = await res.text();
  }
  return { status: res.status, headers: res.headers, body };
}

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL: ' + message);
    throw new Error('Assertion failed: ' + message);
  }
  console.log('PASS: ' + message);
}

async function run() {
  console.log('--- Starting LoliNet Test Suite ---');

  // 1. Start server process
  console.log('Starting server process...');
  const serverProc = spawn('node', ['server/index.js'], {
    cwd: rootDir,
    stdio: 'inherit'
  });

  // Wait for server to bind port
  let serverReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(BASE_URL + '/api/public/state');
      if (res.ok) {
        serverReady = true;
        break;
      }
    } catch {}
    await delay(300);
  }
  assert(serverReady, 'Server process started and is responsive on port ' + PORT);

  try {
    // 2. Test GET / - dynamic SEO injection
    const homeRes = await req('/');
    assert(homeRes.status === 200, 'GET / returned 200 OK');
    assert(homeRes.body.includes('https://m24vc.com/'), 'GET / injected dynamic siteUrl into HTML');
    const currentTitle = getState().settings.title || 'LoliNet'; assert(homeRes.body.includes(`<title>${currentTitle} // 個人導覽站</title>`), 'GET / has dynamic title tag: ' + currentTitle);
    assert(homeRes.body.includes('og:url'), 'GET / has og:url tag');

    // 3. Test robots.txt & sitemap.xml
    const robotsRes = await req('/robots.txt');
    assert(robotsRes.status === 200, 'GET /robots.txt returned 200');
    assert(robotsRes.body.includes('Sitemap: https://m24vc.com/sitemap.xml'), 'robots.txt includes correct sitemap url');
    assert(!robotsRes.body.includes('\r'), 'robots.txt is clean of CRLF injection');

    const sitemapRes = await req('/sitemap.xml');
    assert(sitemapRes.status === 200, 'GET /sitemap.xml returned 200');
    assert(sitemapRes.body.includes('<loc>https://m24vc.com/</loc>'), 'sitemap.xml includes home page');
    assert(sitemapRes.body.includes('<loc>https://m24vc.com/?cat='), 'sitemap.xml includes category URLs');
    assert(!sitemapRes.body.includes('/admin/'), 'sitemap.xml does not leak private /admin/ route');

    // Test llms.txt endpoint for AI Search & Answer Engines
    const llmsRes = await req('/llms.txt');
    assert(llmsRes.status === 200, 'GET /llms.txt returned 200');
    assert(llmsRes.body.includes('# LoliNet'), 'llms.txt includes site title header');
    assert(llmsRes.body.includes('## 導覽分類頻道'), 'llms.txt includes category hierarchy');

    // Test SSR: Verify links are server-rendered into raw HTML
    assert(homeRes.body.includes('class="card"'), 'GET / HTML includes server-rendered cards for crawlers');
    assert(homeRes.body.includes('itemListElement'), 'GET / HTML includes ItemList structured data');

    // Test SSR Category Filtering & Canonical
    const catRes = await req('/?cat=%E9%96%8B%E7%99%BC');
    assert(catRes.status === 200, 'GET /?cat=開發 returned 200');
    assert(catRes.body.includes('開發 精選站點導覽'), 'Category page includes specific title');
    assert(catRes.body.includes('canonical" href="https://m24vc.com/?cat=%E9%96%8B%E7%99%BC"'), 'Category page has self-referential canonical');

    // 4. Test public state endpoint
    const pubRes = await req('/api/public/state');
    assert(pubRes.status === 200, 'GET /api/public/state returned 200');
    assert(Array.isArray(pubRes.body.links), 'Public state has links array');
    assert(pubRes.body.settings && !pubRes.body.settings.pwd, 'Public state does not leak password');

    // 5. Test blocked sensitive paths
    const blockedPaths = [
      '/.env',
      '/.env.example',
      '/.git',
      '/data/lolinet.db',
      '/server/index.js',
      '/package.json'
    ];
    for (const bp of blockedPaths) {
      const bRes = await req(bp);
      assert(bRes.status === 403, 'Path ' + bp + ' is blocked with 403 Forbidden');
    }

    // 6. Test CSRF Protection
    const csrfRes = await req('/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://attacker-site.com'
      },
      body: JSON.stringify({ title: 'Hacked' })
    });
    assert(csrfRes.status === 403, 'Cross-origin admin PUT blocked with 403 CSRF_DETECTED');

    // 7. Test Admin Login (Invalid & Valid)
    const badLogin = await req('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' })
    });
    assert(badLogin.status === 401, 'Invalid password rejected with 401');

    cookies = '';
    const goodLogin = await req('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: config.adminInitPassword })
    });
    assert(goodLogin.status === 200, 'Valid login accepted with 200 OK');
    assert(goodLogin.body.ok === true && goodLogin.body.requireTfa === false, 'Login succeeded without 2FA');
    assert(Boolean(cookies), 'Received session cookie ln_admin_session');


    // Test Image Upload Endpoint
    console.log('Testing Image Upload API...');
    const test1x1Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const uploadRes = await req('/api/admin/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: test1x1Png,
        filename: 'test_pixel.png',
        type: 'avatar'
      })
    });
    assert(uploadRes.status === 200, 'POST /api/admin/upload returned 200 OK');
    assert(uploadRes.body.ok === true, 'Upload response ok === true');
    assert(uploadRes.body.url.startsWith('/assets/uploads/avatar_'), 'Uploaded image saved to /assets/uploads/ path: ' + uploadRes.body.url);

    // Verify static access to the uploaded image
    const imgFetch = await req(uploadRes.body.url);
    assert(imgFetch.status === 200, 'Static GET of uploaded image returned 200 OK');

    // Test saving uploaded avatar in settings
    const currentSettings = await req('/api/admin/settings');
    const updatedSettingsPayload = {
      ...currentSettings.body,
      ava: uploadRes.body.url
    };
    const saveSettingsRes = await req('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedSettingsPayload)
    });
    assert(saveSettingsRes.status === 200, 'Saving uploaded avatar path in settings succeeded');

    // 8. Test Authenticated Admin settings read & update
    const adminSettings = await req('/api/admin/settings');
    assert(adminSettings.status === 200, 'Authenticated GET /api/admin/settings returned 200');

    // 9. Test Link URL auto-normalization (e.g. "github.com" -> "https://github.com")
    const testLinks = [
      { id: 't1', name: 'GitHub Auto Prefix', url: 'github.com', ico: '🐙', cat: '開發', clr: '#00ff88' },
      { id: 't2', name: 'Bilibili HTTPS', url: 'https://bilibili.com', ico: '📺', cat: '媒體', clr: '#00d4ff' }
    ];
    const saveLinksRes = await req('/api/admin/links', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testLinks)
    });
    assert(saveLinksRes.status === 200, 'PUT /api/admin/links returned 200');
    assert(saveLinksRes.body.count === 2, 'Both links saved successfully');

    const getLinksRes = await req('/api/admin/links');
    assert(getLinksRes.body[0].url.startsWith('https://github.com'), 'Link URL "github.com" was auto-normalized to: ' + getLinksRes.body[0].url);

    // 10. Test 2FA Setup Lifecycle
    console.log('Testing 2FA lifecycle...');
    const tfaGen = await req('/api/admin/2fa/generate', { method: 'POST' });
    assert(tfaGen.status === 200, 'POST /api/admin/2fa/generate returned 200');
    assert(Boolean(tfaGen.body.secret && tfaGen.body.otpAuthUrl), 'Received 2FA secret and otpAuthUrl');

    const invalid2fa = await req('/api/admin/2fa/enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '000000' })
    });
    assert(invalid2fa.status === 401, 'Invalid 2FA code rejected on enable');

    // Generate valid TOTP token using otplib
    const validToken = authenticator.generate(tfaGen.body.secret);
    const enable2fa = await req('/api/admin/2fa/enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: validToken })
    });
    assert(enable2fa.status === 200, '2FA enabled with valid TOTP code');

    // Logout
    await req('/api/admin/logout', { method: 'POST' });
    cookies = '';

    // Test Login with 2FA Challenge Flow
    console.log('Testing login when 2FA is active...');
    const step1Login = await req('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: config.adminInitPassword })
    });
    assert(step1Login.status === 200, 'Step 1 login returned 200');
    assert(step1Login.body.requireTfa === true, 'Step 1 login correctly requires 2FA');
    assert(Boolean(step1Login.body.challengeToken), 'Received 2FA challengeToken');

    const challengeToken = step1Login.body.challengeToken;

    // Verify calling verify-2fa without challengeToken fails
    const bad2faAttempt = await req('/api/admin/login/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', token: '123456' })
    });
    assert(bad2faAttempt.status === 400, 'verify-2fa without challengeToken rejected with 400');

    // Verify invalid TOTP code with challengeToken fails
    const wrong2faCode = await req('/api/admin/login/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken, token: '999999' })
    });
    assert(wrong2faCode.status === 401, 'verify-2fa with wrong code rejected with 401');

    // Challenge token is single-use on consumption, so generate a new step 1
    const step1Login2 = await req('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: config.adminInitPassword })
    });
    const challenge2 = step1Login2.body.challengeToken;
    const currentCode = authenticator.generate(tfaGen.body.secret);

    const step2Login = await req('/api/admin/login/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: challenge2, token: currentCode })
    });
    assert(step2Login.status === 200, 'Step 2 verify-2fa with valid challenge and TOTP succeeded with 200');
    assert(Boolean(cookies), 'Authenticated session established after 2FA verification');

    // Disable 2FA to clean up
    const disableCode = authenticator.generate(tfaGen.body.secret);
    const disRes = await req('/api/admin/2fa/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: disableCode })
    });
    assert(disRes.status === 200, '2FA successfully disabled');

    // 11. Test Reset All State
    const resetRes = await req('/api/admin/reset-all', { method: 'POST' });
    assert(resetRes.status === 200, 'Reset all state succeeded with 200');

    console.log('\n=======================================');
    console.log('🎉 ALL INTEGRATION TESTS PASSED CLEANLY!');
    console.log('=======================================\n');
  } finally {
    serverProc.kill('SIGINT');
  }
}

run().catch(err => {
  console.error('\nTEST RUN FAILED:', err);
  process.exit(1);
});
