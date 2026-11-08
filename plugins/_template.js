/**
 * LoliNet Plugin Template
 * 複製此檔案，修改內容後貼入後台「插件中心」安裝，或放入 plugins/ 目錄以 <script> 引入。
 */
(function () {
  'use strict';

  // 1. 定義插件元數據
  const meta = {
    id: 'my-plugin',        // 唯一標識，僅允許英文、數字、橫線
    name: '我的插件',        // 顯示名稱
    version: '1.0.0',
    author: 'YourName',
    description: '這是一個插件範本，示範如何使用 LoliNet 插件接口。',
    icon: '🧩'
  };

  // 2. 定義插件實例
  const instance = {
    /**
     * init 會在插件被載入時呼叫
     * @param {Object} coreAPI  - 核心數據與事件接口
     * @param {Object} adminAPI - 後台界面擴展接口
     */
    init: function (coreAPI, adminAPI) {
      console.log(`[${meta.name}] 初始化完成`);

      // ── 示例 A：監聽數據變化 ──
      coreAPI.on('linksChanged', function (links) {
        console.log(`[${meta.name}] 偵測到連結數變化: ${links.length}`);
      });

      // ── 示例 B：在後台添加一個新標籤頁 ──
      // adminAPI.addTab('📊 統計', function (container) {
      //   container.innerHTML = '<div style="color:var(--cyan)">這裡是插件自訂內容</div>';
      // });

      // ── 示例 C：添加 Dashboard 小部件 ──
      // adminAPI.addWidget(
      //   '<div style="font-size:2em;text-align:center">✨</div><div style="text-align:center;font-size:.75em">Hello Plugin</div>',
      //   'dashboard',
      //   function (el) { /* el 為掛載後的 DOM */ }
      // );

      // ── 示例 D：在連結管理區添加操作按鈕 ──
      // adminAPI.addActionButton({
      //   html: '📥 導出',
      //   onClick: function () {
      //     const data = JSON.stringify(coreAPI.getLinks(), null, 2);
      //     console.log(data);
      //   }
      // });

      // ── 示例 E：在站點設置頁添加面板 ──
      // adminAPI.registerSettingPanel('我的插件設置', function (container) {
      //   container.innerHTML = '<input class="fi" placeholder="插件專屬配置">';
      // });

      // ── 示例 F：讀取/保存插件專屬狀態 ──
      // const myState = coreAPI.getPluginState()['my-plugin'] || {};
      // coreAPI.savePluginState({ ...coreAPI.getPluginState(), 'my-plugin': { ...myState, foo: 'bar' } });
    },

    /**
     * destroy 會在插件被停用或卸載時呼叫
     * 請在此清理定時器、事件監聽等資源
     */
    destroy: function () {
      console.log(`[${meta.name}] 已卸載`);
    }
  };

  // 3. 註冊插件
  if (window.LoliNet && window.LoliNet.Core) {
    window.LoliNet.Core.registerPlugin(meta, instance);
  } else {
    console.error('[Plugin] LoliNet.Core 未就緒，無法註冊插件');
  }
})();
