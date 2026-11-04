/* =====================================================================
   NMN · kết nối trang quản trị với Google Sheets (Apps Script Web App)
   Dùng chung cho Quản trị nội dung (index.html) và Quản lý đơn hàng (orders.html).
   Khoá quản trị chỉ lưu trên trình duyệt này và chỉ gửi tới Apps Script của bạn.
   ===================================================================== */
window.ADMIN_API = (function(){
  "use strict";
  const KEY = "nmn_admin_v1";
  const okUrl = u => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/\S*$/.test(u);
  let cfg = null;
  function read(){
    for (const area of [localStorage, sessionStorage]){
      try { const c = JSON.parse(area.getItem(KEY) || "null"); if (c && c.key) return { ...c, remember: area === localStorage }; } catch (_) {}
    }
    return null;
  }
  function defaultUrl(){ return String(window.NMN_API || "").trim(); }
  function load(){ cfg = read(); if (cfg && !cfg.api) cfg.api = defaultUrl(); return cfg; }
  function save(c, remember){
    clear();
    cfg = { api: c.api, key: c.key };
    try { (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(cfg)); } catch (_) {}
  }
  function clear(){ cfg = null; try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (_) {} }

  class ApiError extends Error { constructor(msg, extra){ super(msg); Object.assign(this, extra || {}); } }
  async function call(action, body, opts){
    const c = (opts && opts.cfg) || cfg;
    if (!c || !c.api) throw new ApiError("Chưa có link Google Apps Script.", { setup: true });
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), (opts && opts.timeout) || 60000);
    let r, j;
    try {
      r = await fetch(c.api, { method: "POST", cache: "no-store", redirect: "follow", signal: ctl.signal,
        headers: { "Content-Type": "text/plain;charset=utf-8" },           // simple request → không preflight
        body: JSON.stringify(Object.assign({ action: "admin." + action, key: c.key }, body || {})) });
      j = await r.json();
    } catch (e){
      throw new ApiError(e.name === "AbortError" ? "Google Apps Script phản hồi quá lâu. Vui lòng thử lại."
        : "Không kết nối được Google Apps Script. Kiểm tra mạng, link Web App và quyền truy cập “Bất kỳ ai”.", { network: true });
    } finally { clearTimeout(t); }
    if (!j || j.ok !== true) throw new ApiError((j && j.error) || "Máy chủ trả lỗi.", j || {});
    return j;
  }
  return { KEY, okUrl, load, save, clear, call, defaultUrl, get cfg(){ return cfg; }, ApiError };
})();
