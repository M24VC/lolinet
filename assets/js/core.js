/**
 * LoliNet Core v2.1
 * 共享核心模块：数据持久化、事件总线、插件系统接口
 */
(function (global) {
  'use strict';

  const DEF_SET = {
    title: 'LoliNet',
    sub: '// 歡迎來到我的小窩 ✧ WELCOME TO MY SPACE //',
    ava: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=kawaii&backgroundColor=b6e3f4,d1d4f9,ffd5dc',
    author: 'LOLI_NET',
    security: {
      tfaEnabled: false,
      tfaSecret: ''
    },
    // SEO 設定（用戶可修改）
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

  const STORAGE_KEY_SET = 'lnset';
  const STORAGE_KEY_LINKS = 'lnlinks';
  const STORAGE_KEY_PLUGINS = 'lnplugins';

  // ── 事件总线 ──
  const events = {};
  function on(evt, cb) {
    if (!events[evt]) events[evt] = [];
    events[evt].push(cb);
  }
  function off(evt, cb) {
    if (!events[evt]) return;
    events[evt] = events[evt].filter(fn => fn !== cb);
  }
  function emit(evt, data) {
    if (!events[evt]) return;
    events[evt].forEach(cb => { try { cb(data); } catch (e) { console.error(e); } });
  }

  // ── 数据层 ──
  function getSettings() {
    try {
      const s = localStorage.getItem(STORAGE_KEY_SET);
      if (!s) return { ...DEF_SET };
      const parsed = JSON.parse(s);
      // 確保 security 物件存在並合併預設值
      if (!parsed.security) parsed.security = {};
      parsed.security = { ...DEF_SET.security, ...parsed.security };
      // 確保 seo 物件存在並合併預設值
      if (!parsed.seo) parsed.seo = {};
      parsed.seo = { ...DEF_SET.seo, ...parsed.seo };
      return { ...DEF_SET, ...parsed };
    } catch { return { ...DEF_SET }; }
  }
  function saveSettings(d) {
    localStorage.setItem(STORAGE_KEY_SET, JSON.stringify(d));
    emit('settingsChanged', d);
  }
  function getLinks() {
    try {
      const l = localStorage.getItem(STORAGE_KEY_LINKS);
      if (!l) { saveLinks([...DEF_LINKS]); return [...DEF_LINKS]; }
      return JSON.parse(l);
    } catch { return [...DEF_LINKS]; }
  }
  function saveLinks(a) {
    localStorage.setItem(STORAGE_KEY_LINKS, JSON.stringify(a));
    emit('linksChanged', a);
  }
  function getPluginState() {
    try {
      const p = localStorage.getItem(STORAGE_KEY_PLUGINS);
      return p ? JSON.parse(p) : {};
    } catch { return {}; }
  }
  function savePluginState(obj) {
    localStorage.setItem(STORAGE_KEY_PLUGINS, JSON.stringify(obj));
  }

  // ── SEO 動態更新工具 ──
  function updateSEOMeta(seo) {
    if (!seo) return;
    const setMeta = (sel, val, attr) => {
      if (!val) return;
      let el = document.querySelector(sel);
      if (!el) {
        el = document.createElement('meta');
        if (sel.includes('property="')) {
          const m = sel.match(/property="([^"]+)"/);
          if (m) el.setAttribute('property', m[1]);
        } else if (sel.includes('name="')) {
          const m = sel.match(/name="([^"]+)"/);
          if (m) el.setAttribute('name', m[1]);
        }
        document.head.appendChild(el);
      }
      el.setAttribute(attr || 'content', val);
    };
    const setLink = (rel, val) => {
      if (!val) return;
      // 移除舊的同名 link
      document.querySelectorAll(`link[rel="${rel}"]`).forEach(el => {
        if (el.dataset.dynamic) el.remove();
      });
      const el = document.createElement('link');
      el.setAttribute('rel', rel);
      el.setAttribute('href', val);
      el.dataset.dynamic = '1';
      document.head.appendChild(el);
    };
    const setTitle = (val) => { if (val) document.title = val; };

    setTitle(seo.title || document.title);
    setMeta('meta[name="description"]', seo.description);
    setMeta('meta[name="keywords"]', seo.keywords);
    setMeta('meta[name="robots"]', seo.robots);
    setMeta('meta[name="theme-color"]', seo.themeColor);
    setMeta('meta[property="og:title"]', seo.title);
    setMeta('meta[property="og:description"]', seo.description);
    setMeta('meta[property="og:url"]', seo.siteUrl);
    setMeta('meta[property="og:image"]', seo.ogImage);
    setMeta('meta[property="og:image:width"]', seo.ogImageWidth);
    setMeta('meta[property="og:image:height"]', seo.ogImageHeight);
    setMeta('meta[property="og:image:alt"]', seo.ogImageAlt);
    setMeta('meta[name="twitter:card"]', seo.twitterCard);
    setMeta('meta[name="twitter:title"]', seo.title);
    setMeta('meta[name="twitter:description"]', seo.description);
    setMeta('meta[name="twitter:image"]', seo.ogImage);
    setLink('canonical', seo.canonical);
    setLink('icon', seo.favicon);
    setLink('apple-touch-icon', seo.favicon);

    // 更新 JSON-LD
    let ld = document.querySelector('script[type="application/ld+json"][data-dynamic]');
    if (!ld) {
      ld = document.createElement('script');
      ld.type = 'application/ld+json';
      ld.dataset.dynamic = '1';
      document.head.appendChild(ld);
    }
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": seo.title || DEF_SET.title,
      "alternateName": (seo.title || DEF_SET.title) + " 個人導覽站",
      "url": seo.siteUrl || DEF_SET.seo.siteUrl,
      "description": seo.description || DEF_SET.seo.description,
      "image": seo.ogImage || DEF_SET.seo.ogImage,
      "author": { "@type": "Person", "name": seo.author || DEF_SET.author },
      "potentialAction": {
        "@type": "SearchAction",
        "target": { "@type": "EntryPoint", "urlTemplate": (seo.siteUrl || DEF_SET.seo.siteUrl) + "?q={search_term_string}" },
        "query-input": "required name=search_term_string"
      }
    });
  }


  // ── Sitemap 生成工具 ──
  function generateSitemap() {
    const S = getSettings();
    const L = getLinks();
    const seo = S.seo || {};
    const baseUrl = (seo.siteUrl || 'https://m24vc.com/').replace(/\/$/, '');
    const today = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

    // 首頁
    xml += `  <url>
`;
    xml += `    <loc>${baseUrl}/</loc>
`;
    xml += `    <lastmod>${today}</lastmod>
`;
    xml += `    <changefreq>weekly</changefreq>
`;
    xml += `    <priority>1.0</priority>
`;
    xml += `  </url>
`;

    // 後台（低優先級）
    xml += `  <url>
`;
    xml += `    <loc>${baseUrl}/admin/</loc>
`;
    xml += `    <lastmod>${today}</lastmod>
`;
    xml += `    <changefreq>monthly</changefreq>
`;
    xml += `    <priority>0.3</priority>
`;
    xml += `  </url>
`;

    // 各分類頁面（如果有查詢參數的話）
    const cats = [...new Set(L.map(l => l.cat).filter(Boolean))];
    cats.forEach(cat => {
      xml += `  <url>
`;
      xml += `    <loc>${baseUrl}/?cat=${encodeURIComponent(cat)}</loc>
`;
      xml += `    <lastmod>${today}</lastmod>
`;
      xml += `    <changefreq>weekly</changefreq>
`;
      xml += `    <priority>0.8</priority>
`;
      xml += `  </url>
`;
    });

    xml += `</urlset>`;
    return xml;
  }

  function generateRobotsTxt() {
    const S = getSettings();
    const seo = S.seo || {};
    const baseUrl = (seo.siteUrl || 'https://m24vc.com/').replace(/\/$/, '');
    let txt = `User-agent: *
`;
    const robots = seo.robots || 'index, follow';
    if (robots.includes('noindex')) {
      txt += `Disallow: /
`;
    } else {
      txt += `Allow: /
`;
      txt += `Disallow: /admin/
`;
    }
    txt += `
Sitemap: ${baseUrl}/sitemap.xml
`;
    return txt;
  }

  // ── 插件系统 ──
  const plugins = {};
  const pluginHooks = {
    tabs: [], actions: [], widgets: [], settings: []
  };

  function registerPlugin(meta, instance) {
    if (!meta || !meta.id) throw new Error('Plugin must have an id');
    if (plugins[meta.id]) unregisterPlugin(meta.id);

    plugins[meta.id] = { meta, instance };

    const adminAPI = {
      addTab: (label, renderFn) => {
        const tid = 'plugin-' + meta.id + '-' + Date.now();
        pluginHooks.tabs.push({ id: tid, label, renderFn, pluginId: meta.id });
        emit('adminTabAdded', { id: tid, label, pluginId: meta.id });
        return tid;
      },
      removeTab: (tid) => {
        pluginHooks.tabs = pluginHooks.tabs.filter(t => t.id !== tid);
        emit('adminTabRemoved', { id: tid });
      },
      addActionButton: (config) => {
        const aid = 'plugin-act-' + meta.id + '-' + Date.now();
        pluginHooks.actions.push({ id: aid, ...config, pluginId: meta.id });
        emit('adminActionAdded', { id: aid, pluginId: meta.id });
        return aid;
      },
      removeActionButton: (aid) => {
        pluginHooks.actions = pluginHooks.actions.filter(a => a.id !== aid);
        emit('adminActionRemoved', { id: aid });
      },
      addWidget: (html, position = 'dashboard', onMount) => {
        const wid = 'plugin-widget-' + meta.id + '-' + Date.now();
        pluginHooks.widgets.push({ id: wid, html, position, onMount, pluginId: meta.id });
        emit('adminWidgetAdded', { id: wid, position, pluginId: meta.id });
        return wid;
      },
      removeWidget: (wid) => {
        pluginHooks.widgets = pluginHooks.widgets.filter(w => w.id !== wid);
        emit('adminWidgetRemoved', { id: wid });
      },
      registerSettingPanel: (title, renderFn) => {
        const sid = 'plugin-set-' + meta.id + '-' + Date.now();
        pluginHooks.settings.push({ id: sid, title, renderFn, pluginId: meta.id });
        emit('adminSettingPanelAdded', { id: sid, title, pluginId: meta.id });
        return sid;
      },
      removeSettingPanel: (sid) => {
        pluginHooks.settings = pluginHooks.settings.filter(s => s.id !== sid);
        emit('adminSettingPanelRemoved', { id: sid });
      },
      notify: (msg, type) => emit('notify', { msg, type })
    };

    const coreAPI = {
      getSettings, saveSettings,
      getLinks, saveLinks,
      getPluginState, savePluginState,
      updateSEOMeta,
      on, off, emit,
      version: '2.1.0'
    };

    

    const ps = getPluginState();
    const isEnabled = !ps[meta.id] || ps[meta.id].enabled !== false;
    ps[meta.id] = { ...(ps[meta.id] || {}), enabled: isEnabled, loadedAt: Date.now() };

    if (isEnabled && typeof instance.init === 'function') {
      try { instance.init(coreAPI, adminAPI); } catch (e) { console.error('Plugin init error:', e); }
    }

    savePluginState(ps);

    emit('pluginLoaded', { id: meta.id, meta });
    console.log(`[LoliNet] Plugin loaded: ${meta.name} v${meta.version}`);
    return true;
  }

  function unregisterPlugin(id) {
    const p = plugins[id];
    if (!p) return false;
    if (typeof p.instance.destroy === 'function') {
      try { p.instance.destroy(); } catch (e) { console.error(e); }
    }
    pluginHooks.tabs = pluginHooks.tabs.filter(t => t.pluginId !== id);
    pluginHooks.actions = pluginHooks.actions.filter(a => a.pluginId !== id);
    pluginHooks.widgets = pluginHooks.widgets.filter(w => w.pluginId !== id);
    pluginHooks.settings = pluginHooks.settings.filter(s => s.pluginId !== id);
    delete plugins[id];

    const ps = getPluginState();
    if (ps[id]) { ps[id].enabled = false; savePluginState(ps); }

    emit('pluginUnloaded', { id });
    console.log(`[LoliNet] Plugin unloaded: ${id}`);
    return true;
  }

  function getPlugin(id) { return plugins[id] || null; }
  function listPlugins() { return Object.values(plugins).map(p => ({ ...p.meta })); }
  function getHooks() { return JSON.parse(JSON.stringify(pluginHooks)); }

  // ── 导出 ──
  global.LoliNet = global.LoliNet || {};
  global.LoliNet.Core = {
    DEF_SET, DEF_LINKS,
    getSettings, saveSettings,
    getLinks, saveLinks,
    getPluginState, savePluginState,
    updateSEOMeta,
    generateSitemap, generateRobotsTxt,
    on, off, emit,
    registerPlugin, unregisterPlugin, getPlugin, listPlugins,
    getHooks
  };

  console.log('%c LoliNet Core v2.1 ✧ 已就緒', 'color:#ff6eb4;font-size:14px;font-weight:bold');
})(window);
