-- ==============================================================
-- LoliNet Database Schema for Cloudflare D1 / SQLite
-- To initialize in Cloudflare D1:
-- npx wrangler d1 execute lolinet-db --file=./schema.sql
-- ==============================================================

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

-- Seed initial state if not present
INSERT OR IGNORE INTO app_state (id, settings_json, links_json, plugin_state_json)
VALUES (
  1,
  '{"title":"LoliNet","sub":"// 歡迎來到我的小窩 ✧ WELCOME TO MY SPACE //","ava":"https://api.dicebear.com/7.x/pixel-art/svg?seed=kawaii&backgroundColor=b6e3f4,d1d4f9,ffd5dc","author":"LOLI_NET","security":{"tfaEnabled":false},"seo":{"siteUrl":"https://m24vc.com/","description":"LoliNet - 賽博龐克風格個人導覽站，收錄開發工具、博客、媒體等精選站點。","keywords":"個人導覽站, 書籤, 導航, 賽博龐克, 網站收藏, 工具箱, 二次元, 技術博客","ogImage":"https://api.dicebear.com/7.x/pixel-art/svg?seed=kawaii&backgroundColor=b6e3f4,d1d4f9,ffd5dc","ogImageWidth":"512","ogImageHeight":"512","ogImageAlt":"LoliNet 像素風格頭像","twitterCard":"summary_large_image","themeColor":"#070712","robots":"index, follow","canonical":"https://m24vc.com/","favicon":"https://api.dicebear.com/7.x/pixel-art/svg?seed=kawaii&backgroundColor=b6e3f4,d1d4f9,ffd5dc"}}',
  '[{"id":"d1","name":"GitHub","ico":"🐙","url":"https://github.com","desc":"全球最大代碼托管平台","cat":"開發","clr":"#00ff88"},{"id":"d2","name":"我的博客","ico":"📝","url":"https://example.com/blog","desc":"技術筆記與日常記錄","cat":"博客","clr":"#ff6eb4"},{"id":"d3","name":"圖片站","ico":"🌸","url":"https://example.com/gallery","desc":"二次元圖片收藏館","cat":"媒體","clr":"#b44fff"},{"id":"d4","name":"Bilibili","ico":"📺","url":"https://bilibili.com","desc":"二次元視頻平台","cat":"媒體","clr":"#00d4ff"},{"id":"d5","name":"工具箱","ico":"🔧","url":"https://example.com/tools","desc":"常用在線工具集合","cat":"工具","clr":"#ffcc00"},{"id":"d6","name":"音樂站","ico":"🎵","url":"https://example.com/music","desc":"我的音樂收藏空間","cat":"媒體","clr":"#ff6633"}]',
  '{}'
);
