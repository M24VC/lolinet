/**
 * LoliNet Demo Plugin: 訪問統計 & 數據導出
 * 功能：
 *   1. 在 Dashboard 顯示當前連結總數
 *   2. 在連結管理頂部添加「導出 JSON」按鈕
 *   3. 在後台新增「📊 統計」標籤頁，顯示分類統計
 */
(function () {
  'use strict';

  const meta = {
    id: 'demo-stats',
    name: '統計與導出',
    version: '1.0.0',
    author: 'LoliNet',
    description: '提供連結數量統計、分類圖表與一鍵導出 JSON 功能。',
    icon: '📊'
  };

  let listeners = [];

  const instance = {
    init: function (coreAPI, adminAPI) {
      // ── Widget: 連結總數 ──
      const updateWidget = function () {
        const links = coreAPI.getLinks();
        const cats = {};
        links.forEach(l => { cats[l.cat || '未分類'] = (cats[l.cat || '未分類'] || 0) + 1; });
        let html = `<div style="font-size:1.6em;text-align:center;color:var(--pink)">${links.length}</div>`;
        html += `<div style="text-align:center;font-size:.7em;color:var(--dim)">總連結數</div>`;
        html += `<div style="margin-top:8px;font-size:.65em">`;
        Object.entries(cats).forEach(([k, v]) => {
          html += `<span style="display:inline-block;margin:2px;padding:2px 6px;border:1px solid var(--b-green);border-radius:4px">${k}: ${v}</span>`;
        });
        html += `</div>`;
        return html;
      };

      adminAPI.addWidget(updateWidget(), 'dashboard', function (el) {
        const refresh = function () {
          el.innerHTML = updateWidget();
        };
        coreAPI.on('linksChanged', refresh);
        listeners.push({ event: 'linksChanged', fn: refresh });
      });

      // ── Action: 導出 JSON ──
      adminAPI.addActionButton({
        html: '📥 導出 JSON',
        onClick: function () {
          const data = JSON.stringify(coreAPI.getLinks(), null, 2);
          const blob = new Blob([data], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'lolinet-links.json'; a.click();
          URL.revokeObjectURL(url);
          adminAPI.notify('✓ 連結已導出');
        }
      });

      // ── Tab: 統計頁面 ──
      adminAPI.addTab('📊 統計', function (container) {
        container.style.color = 'var(--text)';
        const renderStats = function () {
          const links = coreAPI.getLinks();
          const cats = {};
          links.forEach(l => { cats[l.cat || '未分類'] = (cats[l.cat || '未分類'] || 0) + 1; });
          let html = '<div style="font-family:Orbitron,sans-serif;color:var(--pink);margin-bottom:12px">// 分類統計 //</div>';
          html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">';
          Object.entries(cats).forEach(([k, v]) => {
            html += `<div style="border:1px solid var(--b-green);border-radius:6px;padding:10px;text-align:center">
              <div style="font-size:1.4em;color:var(--green)">${v}</div>
              <div style="font-size:.7em;color:var(--dim)">${k}</div>
            </div>`;
          });
          html += '</div>';
          html += `<div style="margin-top:14px;font-size:.72em;color:var(--dim)">最後更新: ${new Date().toLocaleTimeString()}</div>`;
          container.innerHTML = html;
        };
        renderStats();
        const onChange = function () { renderStats(); };
        coreAPI.on('linksChanged', onChange);
        listeners.push({ event: 'linksChanged', fn: onChange });
      });

      console.log(`[${meta.name}] 已載入`);
    },

    destroy: function () {
      listeners.forEach(l => {
        if (window.LoliNet && window.LoliNet.Core) {
          window.LoliNet.Core.off(l.event, l.fn);
        }
      });
      listeners = [];
      console.log(`[${meta.name}] 已卸載`);
    }
  };

  if (window.LoliNet && window.LoliNet.Core) {
    window.LoliNet.Core.registerPlugin(meta, instance);
  }
})();
