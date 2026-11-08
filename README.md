# 🌸 LoliNet — 賽博龐克風格個人導覽站與輕量管理系統

[![License: MIT](https://img.shields.io/badge/License-MIT-ff6eb4.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-00ff88.svg?logo=node.js)](https://nodejs.org/)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-Ready-f38020.svg?logo=cloudflare)](https://pages.cloudflare.com/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-Ready-f38020.svg?logo=cloudflareworkers)](https://workers.cloudflare.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-00d4ff.svg?logo=docker)](https://www.docker.com/)
[![Database: SQLite](https://img.shields.io/badge/Database-SQLite_(WAL)-b44fff.svg?logo=sqlite)](https://sqlite.org/)
[![Style: Cyberpunk](https://img.shields.io/badge/Style-Cyberpunk_Neon-ff6eb4.svg)](#-視覺特色)
[![Tests](https://img.shields.io/badge/Tests-Passing-00ff88.svg)](tools/run_tests.js)

一個極致美觀、極速載入、開箱即用的賽博龐克風格個人導覽站系統。具備完整的**伺服器端渲染 (SSR) SEO**、**AEO (AI 搜尋引擎與 llms.txt)**、**手機觸控體驗優化**、**現代側邊欄管理後台**、**本機圖片上傳**、**TOTP 兩步驟驗證 (2FA)** 與**熱插拔插件擴展機制**。

---

## ✨ 核心特色亮點

### 🎨 1. 賽博龐克沉浸式視覺 (Cyberpunk Neon Experience)
- **動態矩陣數位雨 (Matrix Digital Rain)**：純 HTML5 Canvas 效能優化渲染，具備動態隨機文字串流與漸層光暈。
- **階梯滑入動畫 (Staggered Entry Animations)**：首頁載入與分類切換時，卡片以 `0.04s` 級差依序平滑升起。
- **雷射流光微互動 (Laser Sweep & 3D Tilt)**：滑鼠懸停時雷射光束掃過卡片，並支援桌面端 3D 透視傾斜效果。
- **彩蛋與互動音效**：內置點擊吉祥物表情變換、鍵盤隱藏代碼彩蛋 (`uwulolinet`) 與暗黑模式專注視圖。

### 📱 2. 手機端體驗深度適配 (Mobile-First Optimization)
- **分類橫向滑動條 (Touch Ribbon)**：手機端分類按鈕自動轉為單行橫向滾動條，拇指滑動切換，點選自動平滑居中。
- **防止 iOS Safari 自動放大**：所有輸入框在手機端自動鎖定 `16px` 字級，杜絕輸入時畫面被強制放大變形的問題。
- **標準化觸控目標 (Touch Targets >= 44px)**：全面依據行動介面人機規範加大觸控範圍，消除點擊延遲與點擊高亮灰框。
- **iPhone 底部安全區 (Safe Area Inset)**：全面適配 `viewport-fit=cover`，避免畫面按鈕與 iPhone 底部 Home Bar 重疊。

### 🔍 3. 全端 SEO 與 AI 搜尋引擎優化 (SEO & AEO Ready)
- **真正伺服器端渲染 (SSR)**：首屏 HTML 直接注入完整的站點節點、超連結與描述，讓傳統爬蟲與 AI 檢索機器人一覽無遺。
- **豐富結構化資料 (Schema.org JSON-LD)**：自動生成 `WebSite` + `CollectionPage` + `ItemList`，利於搜尋引擎展示 Rich Snippets。
- **動態分類自參照**：分類頻道具備獨立 Title、Description 與專屬 Canonical 網址，避免重複內容懲罰。
- **AI 搜尋引擎友好**：內建動態 `/llms.txt` 端點，並於 `robots.txt` 正式支援 `OAI-SearchBot`、`Claude-SearchBot`、`PerplexityBot`。
- **自動動態 Sitemap**：依據資料庫中之有效分類自動生成 `/sitemap.xml`，且自動排除 `/admin/` 私有路由。

### 📊 4. 側邊欄後台與圖像化彈窗配置 (/admin/)
- **數據儀表板 (Dashboard)**：首頁專注展示四大 KPI 指標卡、分類佔比彩色長條圖、系統環境遙測與小部件。
- **模組圖像化卡片 (Visual Config Hub)**：將繁雜的站點設定與 SEO 設置收斂為直觀卡片，點擊彈出獨立視窗進行精細配置。
- **Google 搜尋結果即時模擬**：在後台修改 SEO 標題與描述時，即時預覽 Google 搜尋結果樣式。
- **拖曳排序 (Drag-and-Drop)**：連結節點支援滑鼠拖曳排序，亦支援一鍵上下移動與即時分類過濾。

### 📷 5. 本機圖片直接上傳 (Local Media Storage)
- **直接檔案上傳**：更換頭像、Favicon、OG 社群分享圖片時，可直接點擊上傳本機圖片檔（支援 PNG, JPG, WebP, SVG, GIF, 最大 8MB）。
- **伺服器本地保存**：自動存入 `assets/uploads/`，亦同時支援外部 CDN / 外鏈圖片網址。

### 🔐 6. 企業級安全架構 (Hardened Security)
- **登入防爆破限制**：記憶體頻率限制器（5 次失敗鎖定 5 分鐘）。
- **CSRF 來源驗證**：所有管理端狀態變更 API 皆執行 Origin / Referer 檢查。
- **雙因素安全驗證 (2FA / TOTP)**：基於 RFC 6238 標準，登入時透過 3 分鐘有效期之挑戰票證（Challenge Token）防禦暴力破解。
- **終端救援重置工具**：若忘記密碼或遺失 2FA，可在伺服器執行 CLI 指令一秒重置管理員帳號密碼。

### 🔌 7. 微外掛擴展系統 (Hot-Reload Plugin System)
- 免重啟伺服器，直接在後台「插件中心」貼上 JavaScript 原始碼，即可動態擴展分頁、小部件、自訂按鈕與事件監聽。

---

## 🚀 快速開始

### 方法一：傳統 Node.js 部署（推薦開發與小型 VPS）

#### 系統需求
- **Node.js**：`>= 20.0.0`（推薦 `Node.js 22+`，內建原生 `node:sqlite` 零編譯需求）
- **npm**：`>= 9.0.0`

#### 部署步驟
```bash
# 1. 複製專案
git clone https://github.com/M24VC/lolinet.git
cd lolinet

# 2. 安裝相依套件
npm install

# 3. 建立環境變數設定
cp .env.example .env    # Linux / macOS
copy .env.example .env  # Windows

# 4. 啟動服務
npm start
```

訪問 [http://localhost:3000/](http://localhost:3000/) 即可進入導覽首頁！

---


### 方法二：部署至 Cloudflare Pages（推薦！全球邊緣免費託管）

專案已原生適配 **Cloudflare Pages**，提供兩種部署選擇：

#### 方案 2A：零配置純靜態託管（完全免費、免綁定資料庫、最簡單）
1. 在 GitHub 建立你的 LoliNet Repository（或 Fork 本專案）。
2. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/) → 前往 **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**。
3. 選取你的 LoliNet 倉庫，設定構建參數：
   - **Framework preset（框架預設）**：`None`
   - **Build command（構建指令）**：留空（不需要構建）
   - **Build output directory（輸出目錄）**：`.`
4. 點擊 **Save and Deploy**！
> 💡 **靜態離線模式**：在純靜態託管下，系統會自動啟用**本機獨立模式 (LocalStorage Mode)**，可直接在後台登入（預設密碼：`@Aa123456`）、新增修改站點連結、並隨時使用「📥 導出 JSON 備份」與「📤 匯入 JSON 備份」輕鬆管理自己的導覽站！

#### 方案 2B：Full-Stack Edge 邊緣全端（支援 Cloudflare D1 雲端多端同步）
若希望資料在所有裝置即時同步，可啟用 Cloudflare D1 Serverless SQLite：
1. 建立 Cloudflare D1 資料庫：
   ```bash
   npx wrangler d1 create lolinet-db
   ```
2. 初始化資料表結構（已提供標準 SQL）：
   ```bash
   npx wrangler d1 execute lolinet-db --remote --file=./schema.sql
   ```
3. 在 Cloudflare Pages 專案的 **Settings** → **Functions** → **D1 database bindings** 中：
   - **Variable name**：`DB`
   - **D1 database**：選擇剛建立的 `lolinet-db`
4. 重新觸發部署，即可享受全球邊緣節點 SSR 渲染與雲端資料庫保存！

---

### 方法三：部署至 Cloudflare Workers（一鍵命令列發佈）

本專案已包含 `wrangler.json` 與 Workers Static Assets 配置：

```bash
# 1. 登入 Cloudflare
npx wrangler login

# 2. 一鍵發佈至全球邊緣
npx wrangler deploy
```

### 方法四：Docker / Docker Compose 一鍵部署（推薦私有 VPS / NAS）

本專案提供基於 `node:22-alpine` 的極輕量 Multi-stage 鏡像（體積僅約 140MB），資料庫與上傳圖片自動持久化於本機目錄。

```bash
# 1. 下載專案並啟動
git clone https://github.com/M24VC/lolinet.git
cd lolinet
docker compose up -d

# 2. 查看運行日誌
docker compose logs -f
```

- 服務預設運行於本機 `3000` 連接埠。
- SQLite 資料庫自動持久化至本機 `./data` 目錄。
- 上傳的自訂圖片自動持久化至本機 `./assets/uploads` 目錄。

---

### 方法五：寶塔面板 / PM2 常駐部署

```bash
# 使用 PM2 常駐背景運行
npm install -g pm2
pm2 start server/index.js --name "lolinet"
pm2 save
pm2 startup
```

---

## ⚙ 環境變數說明 (`.env`)

在專案根目錄建立 `.env` 檔案以自訂系統參數：

| 變數名稱 | 說明 | 預設值 | 備註 |
|---|---|---|---|
| `PORT` | 服務監聽連接埠 | `3000` | 可依照主機配置修改（例如 8080、8956 等） |
| `DB_PATH` | SQLite 資料庫保存路徑 | `./data/lolinet.db` | 首次啟動時系統會自動建立目錄與預設資料 |
| `SESSION_SECRET` | 登入 Session 簽名密鑰 | `change-me-...` | **正式環境請務必替換為長度 32 位以上之隨機字串** |
| `ADMIN_USERNAME` | 初始管理員帳號 | `admin` | 首次啟動資料庫時建立的管理員帳號 |
| `ADMIN_INIT_PASSWORD` | 初始管理員密碼 | `admin123` | 首次啟動時建立，登入後可隨時在後台修改 |

---

## 🔐 後台管理指南 (`/admin/`)

- **後台路徑**：`http://your-domain/admin/`
- **初始帳號**：`admin`（依 `.env` 之 `ADMIN_USERNAME`）
- **初始密碼**：`admin123`（依 `.env` 之 `ADMIN_INIT_PASSWORD`）

### 忘記密碼或遺失 2FA 救援？
若不慎遺失密碼或手機驗證器遺失無法登入後台，直接在伺服器終端機執行內建救援腳本即可重置帳號密碼並自動停用 2FA：

```bash
# 重置為 .env 中的預設帳密
npm run reset-admin

# 或手動指定新帳號與密碼
node server/reset-admin.js admin your_new_password
```

---

## 🔌 外掛擴展開發 (Plugin API)

LoliNet 內建輕量外掛沙箱，允許第三方開發者自由擴展功能。

### 最小可用外掛範例
```javascript
(function () {
  const meta = {
    id: 'hello-plugin',
    name: '打招呼外掛',
    version: '1.0.0',
    author: 'Developer',
    description: '在 Dashboard 顯示歡迎訊息',
    icon: '✨'
  };

  const instance = {
    init: function (coreAPI, adminAPI) {
      // 在數據儀表板中加入一個小部件
      adminAPI.addWidget(
        '<div style="text-align:center;padding:10px;color:var(--cyan)">Hello Cyberpunk World!</div>',
        'dashboard'
      );
    },
    destroy: function () {
      console.log('外掛已卸載');
    }
  };

  window.LoliNet.Core.registerPlugin(meta, instance);
})();
```

### 核心接口總覽
- **`coreAPI`**：
  - `getSettings()`, `saveSettings(obj)`
  - `getLinks()`, `saveLinks(arr)`
  - `getPluginState()`, `savePluginState(obj)`
  - `on(event, cb)`, `off(event, cb)`, `emit(event, data)`
- **`adminAPI`**：
  - `addTab(label, renderFn)`：新增獨立管理分頁
  - `addWidget(html, position, onMount)`：在 Dashboard 註冊小部件
  - `addActionButton(config)`：在列表區加入操作按鈕
  - `notify(msg, type)`：呼叫系統懸浮提示通知

---

## 🧪 自動化測試

專案附帶完整的端對端自動化整合測試套件，涵蓋路徑防護、CSRF 檢查、SSR 卡片生成、結構化資料輸出、2FA 生命週期驗證、本機圖片上傳 API 等 26 項驗證指標：

```bash
npm test
```

---

## 📁 專案目錄結構

```text
lolinet/
├── admin/                  # 後台管理介面 (HTML / CSS / JS)
├── assets/                 # 靜態資源目錄
│   ├── css/                # 樣式表 (main.css, admin.css)
│   ├── js/                 # 核心邏輯 (core.js, admin.js)
│   └── uploads/            # 本機上傳圖片保存目錄 (.gitkeep)
├── data/                   # SQLite 資料庫目錄 (.gitkeep)
├── plugins/                # 內置插件與外掛範本 (_template.js, demo-plugin.js)
├── server/                 # 後端 Express 服務
│   ├── auth.js             # 認證、Session 與 2FA 挑戰票證邏輯
│   ├── config.js           # 環境變數與配置加載
│   ├── db.js               # SQLite 資料庫初始化與資料存取層
│   ├── index.js            # Express 主服務、SSR 渲染與 API 路由
│   ├── reset-admin.js      # CLI 管理員救援指令
│   └── totp.js             # RFC 6238 雙因素安全密鑰生成與校驗
├── tools/                  # 工具與測試套件
│   └── run_tests.js        # 端對端自動化測試腳本
├── .dockerignore           # Docker 構建排除清單
├── .env.example            # 環境變數範本檔
├── .gitignore              # Git 敏感檔案排除清單
├── docker-compose.yml      # Docker Compose 一鍵編排檔
├── Dockerfile              # Docker 映像構建檔
├── index.html              # 前台個人導覽主頁面
├── LICENSE                 # MIT 開源授權合約
├── package.json            # 專案相依套件與腳本定義
└── README.md               # 專案完整說明文檔
```

---

## 📄 開源授權 (License)

本專案基於 [MIT License](LICENSE) 條款開放原始碼，歡迎自由使用、修改、客製化或商業部署。
