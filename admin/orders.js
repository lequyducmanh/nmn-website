/* =====================================================================
   NMN · Quản lý đơn hàng (Google Sheets)
   - Đăng nhập bằng Khoá quản trị (dùng chung với trang Quản trị nội dung)
   - Đơn hàng / lời nhắn / giao dịch đọc từ Google Sheet, tự cập nhật mỗi 20 giây
   - Đổi trạng thái, ghi chú nội bộ, xác nhận thanh toán → ghi thẳng vào Sheet
   ===================================================================== */
(() => {
"use strict";
const API = window.ADMIN_API;
const POLL = 20000;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = n => new Intl.NumberFormat("vi-VN").format(Math.round(Number(n) || 0)) + "đ";
const toDate = t => { if (!t) return null; const d = new Date(t); return isNaN(d) ? null : d; };
const dt = t => { const d = toDate(t); return d ? d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "—"; };
const ago = t => {
  const d = toDate(t); if (!d) return "—";
  const s = (Date.now() - d) / 1000;
  return s < 60 ? "vừa xong" : s < 3600 ? Math.floor(s / 60) + " phút trước" : s < 86400 ? Math.floor(s / 3600) + " giờ trước" : d.toLocaleDateString("vi-VN");
};
const isToday = t => { const d = toDate(t); if (!d) return false; const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };
function toast(msg, bad){ const t = $("#toast"); t.textContent = msg; t.classList.toggle("bad", !!bad); t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), bad ? 5200 : 2800); }
async function copy(v, label){
  let ok = false;
  try { await navigator.clipboard.writeText(v); ok = true; } catch (_) {
    const ta = document.createElement("textarea"); ta.value = v; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand("copy"); } catch (_) {} ta.remove();
  }
  toast(ok ? `Đã sao chép ${label}` : v);
}

const FUL = { new: ["Mới", "gold"], confirmed: ["Đã xác nhận", "on"], shipping: ["Đang giao", "on"], done: ["Hoàn tất", "off"], cancelled: ["Đã huỷ", "warn"] };
const PAY = { pending: ["Chờ thanh toán", "warn"], partial: ["Thiếu tiền", "warn"], paid: ["Đã thanh toán", "on"], cod: ["COD", "off"] };
const badge = ([t, c]) => `<span class="badge ${c}">${esc(t)}</span>`;

const S = { tab: "orders", orders: [], contacts: [], payments: [], sepay: {}, filter: "all", q: "", seen: null, open: null, timer: null, loading: false, sheetUrl: "", loadedAt: null };

/* ---------------- đăng nhập ---------------- */
function gate(err){
  $("#gate").hidden = false; $("#app").hidden = true;
  const c = API.load(), def = API.defaultUrl();
  $("#g-api").value = (c && c.api) || def;
  if (!def) $("#g-adv").open = true;
  $("#gate-err").textContent = err || "";
}
$("#gate-form").addEventListener("submit", async e => {
  e.preventDefault();
  const api = $("#g-api").value.trim() || API.defaultUrl(), key = $("#g-key").value.trim();
  if (!API.okUrl(api)){ $("#g-adv").open = true; $("#gate-err").textContent = "Link Web App chưa đúng — dạng https://script.google.com/macros/s/…/exec"; return; }
  if (!key) return;
  $("#gate-err").textContent = "Đang kết nối…";
  try {
    const p = await API.call("ping", {}, { cfg: { api, key } });
    API.save({ api, key }, $("#g-remember").checked);
    $("#g-key").value = "";
    start(p);
  } catch (err){ $("#gate-err").textContent = err.message; }
});
function logout(){ API.clear(); stop(); gate(); }
$("#logout").addEventListener("click", logout);

/* ---------------- dữ liệu (tự cập nhật) ---------------- */
function stop(){ clearTimeout(S.timer); S.timer = null; S.seen = null; }
function start(ping){
  $("#gate").hidden = true; $("#app").hidden = false;
  S.sheetUrl = (ping && ping.sheetUrl) || "";
  $("#who").innerHTML = S.sheetUrl ? `Google Sheet: <b>${esc((ping && ping.sheetName) || "")}</b>` : "";
  $("#sheet-link").href = S.sheetUrl || "#";
  go(location.hash.slice(1) || "orders");
  refresh();
}
function live(state, text){ const el = $("#live"); el.classList.toggle("off", state === "off"); el.classList.toggle("busy", state === "busy"); el.querySelector("span").textContent = text; }
async function refresh(manual){
  clearTimeout(S.timer);
  if (S.loading) return;
  S.loading = true; live("busy", "Đang tải…");
  try {
    const j = await API.call("orders", { limit: 500 });
    S.orders = j.orders; S.contacts = j.contacts; S.payments = j.payments; S.sepay = j.sepay || {}; S.loadedAt = new Date();
    const ids = new Set(S.orders.map(o => o.id));
    if (S.seen){ const fresh = S.orders.filter(o => !S.seen.has(o.id)); if (fresh.length) toast(`🛒 Có ${fresh.length} đơn hàng mới: ${fresh[0].code} · ${fmt(fresh[0].total)}`); }
    S.seen = ids; counts();
    live("on", "Cập nhật " + S.loadedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    renderTab(); if (S.open) renderDetail(S.open);
    if (manual) toast("Đã tải dữ liệu mới nhất");
  } catch (e){
    if (e.auth) return gate(e.message);
    live("off", "Mất kết nối"); if (manual || !S.loadedAt) toast(e.message, true);
  } finally {
    S.loading = false;
    if (!$("#app").hidden) S.timer = setTimeout(() => refresh(), document.hidden ? POLL * 3 : POLL);
  }
}
$("#live").addEventListener("click", () => refresh(true));
document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("#app").hidden && S.loadedAt && Date.now() - S.loadedAt > 5000) refresh(); });
function counts(){
  const n = S.orders.filter(o => o.fulfillment === "new").length;
  const c = S.contacts.filter(x => !x.handled).length;
  const set = (id, v) => { const el = $(id); el.textContent = v; el.hidden = !v; };
  set("#cnt-orders", n); set("#cnt-contacts", c);
  document.title = (n ? `(${n}) ` : "") + "Quản lý đơn hàng · Clastive";
}
/* cập nhật 1 đơn ngay trên màn hình (không chờ lần tải sau) */
function patchOrder(o){ const i = S.orders.findIndex(x => x.id === o.id); if (i >= 0) S.orders[i] = o; counts(); renderTab(); if (S.open === o.id) renderDetail(o.id); }

/* ---------------- điều hướng ---------------- */
const TITLES = { orders: "Đơn hàng", contacts: "Lời nhắn", payments: "Thanh toán · SePay" };
function go(tab){
  if (!TITLES[tab]) tab = "orders";
  S.tab = tab; history.replaceState(null, "", "#" + tab);
  $$("#nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  $("#title").textContent = TITLES[tab]; document.body.classList.remove("nav-open");
  renderTab();
}
function renderTab(){ ({ orders: renderOrders, contacts: renderContacts, payments: renderPayments })[S.tab](); }
$("#nav").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) go(b.dataset.tab); });
$("#menu-btn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
$("#side-ov").addEventListener("click", () => document.body.classList.remove("nav-open"));

/* ---------------- ĐƠN HÀNG ---------------- */
const payState = o => (o.payment && o.payment.state) || "cod";
const FILTERS = [
  ["all", "Tất cả", () => true],
  ["new", "Cần xử lý", o => o.fulfillment === "new"],
  ["pending", "Chờ thanh toán", o => ["pending", "partial"].includes(payState(o)) && o.fulfillment !== "cancelled"],
  ["paid", "Đã thanh toán", o => payState(o) === "paid"],
  ["cod", "COD", o => payState(o) === "cod"],
  ["shipping", "Đang giao", o => o.fulfillment === "shipping"],
  ["done", "Hoàn tất", o => o.fulfillment === "done"],
  ["cancelled", "Đã huỷ", o => o.fulfillment === "cancelled"]
];
function matches(o){
  const f = FILTERS.find(x => x[0] === S.filter) || FILTERS[0];
  if (!f[2](o)) return false;
  if (!S.q) return true;
  const c = o.customer || {};
  const hay = [o.code, c.name, c.phone, c.email, c.address, (o.items || []).map(i => i.name).join(" ")].join(" ").toLowerCase();
  return S.q.toLowerCase().split(/\s+/).every(t => hay.includes(t));
}
function renderOrders(){
  if (S.tab !== "orders") return;
  const today = S.orders.filter(o => isToday(o.createdAt) && o.fulfillment !== "cancelled");
  const revenue = S.orders.filter(o => isToday(o.payment && o.payment.paidAt) && payState(o) === "paid").reduce((s, o) => s + (o.total || 0), 0);
  const list = S.orders.filter(matches);
  const prev = $("#o-q") && document.activeElement === $("#o-q");
  $("#view").innerHTML = `
    <div class="stats">
      <div class="stat"><b>${today.length}</b><span>Đơn hôm nay</span></div>
      <div class="stat"><b>${fmt(revenue)}</b><span>Đã nhận chuyển khoản hôm nay</span></div>
      <div class="stat"><b>${S.orders.filter(FILTERS[2][2]).length}</b><span>Chờ thanh toán</span></div>
      <div class="stat"><b>${S.orders.filter(FILTERS[1][2]).length}</b><span>Cần xử lý</span></div>
    </div>
    <section class="card">
      <div class="o-tools">
        <div class="chips" role="tablist">${FILTERS.map(([k, l, f]) => `<button type="button" class="chip${S.filter === k ? " on" : ""}" data-f="${k}" role="tab" aria-selected="${S.filter === k}">${esc(l)} <span>${S.orders.filter(f).length}</span></button>`).join("")}</div>
        <div class="o-search"><input id="o-q" type="search" placeholder="Tìm mã đơn, tên, số điện thoại…" value="${esc(S.q)}" aria-label="Tìm đơn hàng">
          <button type="button" class="btn btn-line btn-sm" id="o-csv">Tải CSV</button></div>
      </div>
      ${!S.loadedAt ? `<div class="empty">Đang tải đơn hàng từ Google Sheet…</div>` : list.length ? `<div class="olist">${list.map(row).join("")}</div>` : `<div class="empty">${S.orders.length ? "Không có đơn phù hợp." : "Chưa có đơn hàng nào. Đơn mới sẽ hiện ở đây (và trong trang tính “Đơn hàng”) ngay khi khách đặt."}</div>`}
    </section>`;
  if (prev){ const i = $("#o-q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
function row(o){
  const c = o.customer || {}, items = (o.items || []).map(i => i.qty ? `${i.name} × ${i.qty}` : i.name).join(", ");
  return `<button type="button" class="orow" data-o="${esc(o.id)}">
    <span class="o1"><b>${esc(o.code)}</b><small title="${esc(dt(o.createdAt))}">${esc(ago(o.createdAt))}</small></span>
    <span class="o2"><b>${esc(c.name)}</b><small>${esc(c.phone)} · ${esc(c.province || "")}</small></span>
    <span class="o3">${esc(items)}</span>
    <span class="o4"><b>${fmt(o.total)}</b><span>${badge(PAY[payState(o)] || PAY.cod)} ${badge(FUL[o.fulfillment] || FUL.new)}</span></span>
  </button>`;
}
$("#view").addEventListener("click", e => {
  const f = e.target.closest("[data-f]"); if (f){ S.filter = f.dataset.f; renderOrders(); return; }
  const r = e.target.closest("[data-o]"); if (r){ S.open = r.dataset.o; renderDetail(S.open, true); return; }
  if (e.target.closest("#o-csv")) return csv();
  const h = e.target.closest("[data-handled]"); if (h) return setHandled(h.dataset.handled, h.dataset.v === "1", h);
  if (e.target.closest("#sp-sync")) return syncNow(e.target.closest("#sp-sync"));
  const cp = e.target.closest("[data-cp]"); if (cp) return copy(cp.dataset.cp, cp.dataset.cpl || "");
});
$("#view").addEventListener("input", e => { if (e.target.id === "o-q"){ S.q = e.target.value.trim(); clearTimeout(S.qt); S.qt = setTimeout(renderOrders, 150); } });

/* chi tiết đơn */
function renderDetail(id, open){
  const o = S.orders.find(x => x.id === id); if (!o) return;
  const m = $("#modal"), card = $("#modal-card");
  if (!open && m.hidden) return;
  const c = o.customer || {}, p = o.payment || {}, st = payState(o);
  const pays = S.payments.filter(x => x.orderCode === o.code);
  const tel = String(c.phone || "").replace(/\D/g, "");
  const focusId = document.activeElement && card.contains(document.activeElement) ? document.activeElement.id : null;
  const draft = $("#od-note") && !m.hidden && S.noteFor === id ? $("#od-note").value : null;
  card.innerHTML = `
    <div class="od-head"><div><h2 id="od-title">${esc(o.code)}</h2><p class="muted small">${esc(dt(o.createdAt))}${o.row ? ` · hàng ${o.row} trên Sheet` : ""}</p></div>
      <button type="button" class="icon" data-close aria-label="Đóng">✕</button></div>
    <div class="od-badges">${badge(PAY[st] || PAY.cod)} ${badge(FUL[o.fulfillment] || FUL.new)}</div>
    <div class="od-grid">
      <section><h3>Khách hàng</h3>
        <p><b>${esc(c.name)}</b></p>
        <p><a href="tel:${esc(tel)}">${esc(c.phone)}</a> · <a href="https://zalo.me/${esc(tel)}" target="_blank" rel="noopener">Zalo</a>${c.email ? ` · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}</p>
        <p class="od-addr">${esc(c.address)}</p>
        <button type="button" class="btn btn-line btn-sm" data-cp="${esc(`${c.name} · ${c.phone}\n${c.address}`)}" data-cpl="địa chỉ giao hàng">Sao chép địa chỉ</button>
        ${c.note ? `<p class="od-note"><b>Ghi chú của khách:</b> ${esc(c.note)}</p>` : ""}
      </section>
      <section><h3>Thanh toán</h3>
        <p>${p.method === "bank" ? "Chuyển khoản · VietQR" : "Thanh toán khi nhận hàng (COD)"}</p>
        ${p.method === "bank" ? `<p>Nội dung CK: <b>${esc(p.payCode)}</b></p><p>Đã nhận: <b>${fmt(p.paid)}</b> / ${fmt(o.total)}${p.paidAt ? ` · ${esc(dt(p.paidAt))}` : ""}${p.manual ? " · <i>xác nhận thủ công</i>" : ""}</p>` : ""}
        ${pays.length ? `<ul class="od-pays">${pays.map(x => `<li>${fmt(x.amount)} · ${esc(x.date || dt(x.createdAt))} · ${esc(x.bank || "")}<br><small>${esc(x.content)}</small></li>`).join("")}</ul>` : ""}
        ${p.method === "bank" && st !== "paid" ? `<button type="button" class="btn btn-line btn-sm" id="od-paid">Đánh dấu đã thanh toán</button>` : ""}
        ${o.check && o.check !== "OK" ? `<p class="od-note">${esc(o.check)}</p>` : ""}
      </section>
    </div>
    <section class="od-items"><h3>Sản phẩm</h3>
      <table>${(o.items || []).map(i => `<tr><td>${esc(i.name)}</td><td>${i.qty ? `${fmt(i.price)} × ${i.qty}` : ""}</td><td>${fmt(i.lineTotal)}</td></tr>`).join("")}
        <tr class="sum"><td>Tạm tính</td><td></td><td>${fmt(o.subtotal)}</td></tr>
        <tr class="sum"><td>Phí giao hàng</td><td></td><td>${o.shipping == null ? "Báo khi xác nhận" : fmt(o.shipping)}</td></tr>
        <tr class="sum total"><td>Tổng cộng</td><td></td><td>${fmt(o.total)}</td></tr></table>
    </section>
    <section class="od-ful"><h3>Xử lý đơn</h3>
      <div class="fulbtns" role="group" aria-label="Trạng thái đơn">${Object.entries(FUL).map(([k, [l]]) => `<button type="button" class="chip${o.fulfillment === k ? " on" : ""}" data-ful="${k}" aria-pressed="${o.fulfillment === k}">${esc(l)}</button>`).join("")}</div>
      <label class="fl" style="margin-top:12px">Ghi chú nội bộ<textarea id="od-note" rows="2" placeholder="Ví dụ: đã gọi xác nhận, giao GHTK mã …">${esc(draft != null ? draft : o.adminNote || "")}</textarea></label>
      <div class="acts"><button type="button" class="btn btn-ink btn-sm" id="od-save-note">Lưu ghi chú</button></div>
    </section>`;
  S.noteFor = id;
  if (m.hidden){ m.hidden = false; document.body.classList.add("lock"); card.querySelector("[data-close]").focus(); }
  else if (focusId && $("#" + focusId)) $("#" + focusId).focus();
}
function closeDetail(){ $("#modal").hidden = true; document.body.classList.remove("lock"); const id = S.open; S.open = null; S.noteFor = null; const r = $(`[data-o="${CSS.escape(id || "")}"]`); if (r) r.focus(); }
async function update(o, patch, done, btn){
  if (btn) btn.disabled = true;
  try { const j = await API.call("updateOrder", Object.assign({ code: o.code }, patch)); patchOrder(j.order); toast(done); }
  catch (err){ if (err.auth) return gate(err.message); toast("Không lưu được: " + err.message, true); }
  finally { if (btn && document.body.contains(btn)) btn.disabled = false; }
}
$("#modal").addEventListener("click", async e => {
  if (e.target.id === "modal" || e.target.closest("[data-close]")) return closeDetail();
  const cp = e.target.closest("[data-cp]"); if (cp) return copy(cp.dataset.cp, cp.dataset.cpl || "");
  const o = S.orders.find(x => x.id === S.open); if (!o) return;
  const fu = e.target.closest("[data-ful]");
  if (fu && fu.dataset.ful !== o.fulfillment) return update(o, { status: fu.dataset.ful }, "Đã cập nhật: " + FUL[fu.dataset.ful][0], fu);
  const sv = e.target.closest("#od-save-note");
  if (sv) return update(o, { adminNote: $("#od-note").value.slice(0, 1000) }, "Đã lưu ghi chú", sv);
  const pd = e.target.closest("#od-paid");
  if (pd){
    if (!confirm(`Xác nhận đã nhận đủ ${fmt(o.total)} cho đơn ${o.code}?\nChỉ dùng khi bạn đã kiểm tra tiền vào tài khoản.`)) return;
    return update(o, { markPaid: true }, "Đã đánh dấu đã thanh toán", pd);
  }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#modal").hidden) closeDetail(); });

function csv(){
  const rows = [["Mã đơn", "Thời gian", "Khách hàng", "SĐT", "Email", "Địa chỉ", "Sản phẩm", "Tổng", "Thanh toán", "Trạng thái thanh toán", "Đã nhận", "Xử lý", "Ghi chú khách", "Ghi chú nội bộ"]];
  S.orders.filter(matches).forEach(o => { const c = o.customer || {}, p = o.payment || {};
    rows.push([o.code, dt(o.createdAt), c.name, c.phone, c.email, c.address, (o.items || []).map(i => i.qty ? `${i.name} x ${i.qty}` : i.name).join("; "), o.total, p.method === "bank" ? "Chuyển khoản" : "COD", (PAY[payState(o)] || PAY.cod)[0], p.paid || 0, (FUL[o.fulfillment] || FUL.new)[0], c.note, o.adminNote]); });
  const cell = v => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob(["﻿" + rows.map(r => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `don-hang-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------- LỜI NHẮN ---------------- */
function renderContacts(){
  if (S.tab !== "contacts") return;
  $("#view").innerHTML = `<section class="card">
    ${S.contacts.length ? `<div class="clist">${S.contacts.map(c => { const tel = String(c.phone || "").replace(/\D/g, ""); return `<article class="citem${c.handled ? " done" : ""}">
      <div class="ch"><b>${esc(c.name)}</b> <a href="tel:${esc(tel)}">${esc(c.phone)}</a> · <a href="https://zalo.me/${esc(tel)}" target="_blank" rel="noopener">Zalo</a>${c.email ? ` · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}
        <small title="${esc(dt(c.createdAt))}">${esc(ago(c.createdAt))}</small></div>
      ${c.topic || c.product ? `<p class="muted small">${esc([c.topic, c.product].filter(Boolean).join(" · "))}</p>` : ""}
      <p class="cmsg">${esc(c.message)}</p>
      <button type="button" class="btn btn-sm ${c.handled ? "btn-line" : "btn-ink"}" data-handled="${esc(c.id)}" data-v="${c.handled ? 0 : 1}">${c.handled ? "Đánh dấu chưa xử lý" : "Đã xử lý ✓"}</button>
    </article>`; }).join("")}</div>` : `<div class="empty">${S.loadedAt ? "Chưa có lời nhắn nào từ trang Liên hệ." : "Đang tải…"}</div>`}
  </section>`;
}
async function setHandled(id, v, btn){
  btn.disabled = true;
  try { await API.call("updateContact", { id, handled: v }); const c = S.contacts.find(x => x.id === id); if (c) c.handled = v; counts(); renderContacts(); }
  catch (e){ if (e.auth) return gate(e.message); toast("Không lưu được: " + e.message, true); btn.disabled = false; }
}

/* ---------------- THANH TOÁN · SEPAY ---------------- */
function renderPayments(){
  if (S.tab !== "payments") return;
  const sp = S.sepay || {};
  $("#view").innerHTML = `
    <section class="card"><h2>Xác nhận chuyển khoản tự động (SePay)</h2>
      <p class="desc">Google Apps Script hỏi SePay các giao dịch tiền vào mỗi phút — và ngay lập tức khi khách đang mở trang chờ thanh toán. Giao dịch có nội dung chứa mã đơn (ví dụ <code>NMN261104ABCDE</code>) sẽ tự cộng vào đơn; đủ tiền → <b>Đã thanh toán</b>, trang của khách tự cập nhật.</p>
      <div class="sp-st">
        <div>Trạng thái: ${sp.on ? `<b class="on">Đã kết nối SePay</b>${sp.account ? ` · tài khoản ${esc(sp.account)}` : " · mọi tài khoản trong SePay"}` : `<b class="off">Chưa kết nối</b> — chưa có <code>SEPAY_TOKEN</code>`}</div>
        ${sp.on ? `<div>Kiểm tra gần nhất: ${sp.lastSync ? esc(dt(sp.lastSync)) + " (" + esc(ago(sp.lastSync)) + ")" : "chưa chạy"}</div>` : ""}
        ${sp.lastError ? `<div style="color:var(--rose)">Lỗi gần nhất: ${esc(sp.lastError)} — kiểm tra lại SEPAY_TOKEN.</div>` : ""}
      </div>
      <div class="acts" style="justify-content:flex-start"><button type="button" class="btn btn-ink" id="sp-sync" ${sp.on ? "" : "disabled"}>Kiểm tra giao dịch ngay</button>${S.sheetUrl ? `<a class="btn btn-line" href="${esc(S.sheetUrl)}" target="_blank" rel="noopener">Mở Google Sheet ↗</a>` : ""}</div>
    </section>
    <section class="card"><h2>Cài đặt (làm một lần)</h2>
      <ol class="tips">
        <li>my.sepay.vn → <b>Ngân hàng</b>: kết nối tài khoản nhận tiền (ví dụ MB Bank 0985233655).</li>
        <li>my.sepay.vn → <b>Cấu hình công ty → API Access → + Thêm API</b>: đặt tên (ví dụ “NMN website”), trạng thái Hoạt động → sao chép <b>API Token</b>.</li>
        <li>Google Sheet → <b>Tiện ích mở rộng → Apps Script → ⚙ Cài đặt dự án → Thuộc tính tập lệnh</b>: thêm <code>SEPAY_TOKEN</code> = API Token, <code>SEPAY_ACCOUNT</code> = số tài khoản nhận tiền → Lưu. <i>Token chỉ nằm trong Apps Script, không đưa vào website hay CMS.</i></li>
        <li>(Khuyên dùng) SePay → <b>Cấu hình công ty → Cấu trúc mã thanh toán</b>: tiền tố <code>NMN</code>.</li>
        <li>CMS → <a href="./#settings">Cài đặt chung</a> → Chuyển khoản: bật <b>Tự động xác nhận đã thanh toán (SePay)</b> → Xuất bản.</li>
        <li>Thử: đặt sản phẩm test 5.000đ, chuyển khoản → giao dịch hiện ở bảng dưới, đơn chuyển sang Đã thanh toán.</li>
      </ol>
    </section>
    <section class="card"><h2>Giao dịch tiền vào gần đây</h2>
      ${S.payments.length ? `<div class="plist">${S.payments.map(x => `<div class="prow"><span><b>${fmt(x.amount)}</b> ${x.orderCode ? `<span class="badge on">Đơn ${esc(x.orderCode)}</span>` : `<span class="badge warn">Không khớp đơn</span>`}</span>
        <small>${esc(x.date || dt(x.createdAt))} · ${esc(x.bank || "")}</small><span class="pc">${esc(x.content)}</span></div>`).join("")}</div>` : `<div class="empty">Chưa ghi nhận giao dịch nào từ SePay.</div>`}
    </section>`;
}
async function syncNow(btn){
  btn.disabled = true; btn.textContent = "Đang kiểm tra…";
  try { const r = await API.call("sync"); toast(`Đã kiểm tra: ${r.added || 0} giao dịch mới, ${r.matched || 0} khớp đơn`); await refresh(); }
  catch (e){ if (e.auth) return gate(e.message); toast(e.message, true); renderPayments(); }
}

/* ---------------- khởi động ---------------- */
const saved = API.load();
if (saved && saved.key && saved.api){
  API.call("ping").then(start).catch(e => gate(e.auth ? e.message : e.network ? e.message : e.message));
} else gate();
})();
