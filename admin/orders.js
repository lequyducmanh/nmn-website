/* =====================================================================
   NMN · Quản lý đơn hàng (Firebase)
   - Đăng nhập Google; chỉ email có trong Firestore "admins" mới xem được
   - Đơn hàng / lời nhắn / giao dịch cập nhật trực tiếp (onSnapshot)
   - Cài đặt SePay: URL webhook + khoá API (lưu ở config/sepay)
   ===================================================================== */
const SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = n => new Intl.NumberFormat("vi-VN").format(Math.round(Number(n) || 0)) + "đ";
const toDate = t => t && t.toDate ? t.toDate() : t ? new Date(t) : null;
const dt = t => { const d = toDate(t); return d ? d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "—"; };
const ago = t => {
  const d = toDate(t); if (!d) return "vừa xong";
  const s = (Date.now() - d) / 1000;
  return s < 60 ? "vừa xong" : s < 3600 ? Math.floor(s / 60) + " phút trước" : s < 86400 ? Math.floor(s / 3600) + " giờ trước" : d.toLocaleDateString("vi-VN");
};
const isToday = t => { const d = toDate(t); if (!d) return true; const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };
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

const S = { fb: null, user: null, tab: "orders", orders: [], contacts: [], payments: [], filter: "all", q: "", unsub: [], seen: null, open: null, sepay: null };

/* ---------------- khởi động ---------------- */
function gate(title, text, { login = false, logout = false, err = "" } = {}){
  $("#gate").hidden = false; $("#app").hidden = true;
  $("#gate-title").textContent = title; $("#gate-text").innerHTML = text;
  $("#g-login").hidden = !login; $("#g-logout").hidden = !logout; $("#gate-err").textContent = err;
}
async function boot(){
  let cfg = null;
  try { const r = await fetch("/__/firebase/init.json", { cache: "no-store" }); if (r.ok) cfg = await r.json(); } catch (_) {}
  if (!cfg || !cfg.projectId){
    gate("Chưa kết nối Firebase", "Trang quản lý đơn hàng chạy trên <b>Firebase Hosting</b>. Hãy mở trang này từ địa chỉ <code>…web.app/admin/orders.html</code> sau khi đã triển khai (xem README → Firebase).");
    return;
  }
  const [appM, authM, fsM] = await Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-firestore.js")]);
  const app = appM.initializeApp(cfg);
  S.fb = { ...authM, ...fsM, auth: authM.getAuth(app), db: fsM.getFirestore(app) };
  const { auth } = S.fb;
  S.fb.getRedirectResult(auth).catch(e => $("#gate-err").textContent = authError(e));
  $("#g-login").onclick = signIn;
  $("#g-logout").onclick = $("#logout").onclick = () => S.fb.signOut(auth);
  S.fb.onAuthStateChanged(auth, async user => {
    stop(); S.user = user;
    if (!user) return gate("Đăng nhập", "Đăng nhập bằng tài khoản Google đã được cấp quyền quản trị.", { login: true });
    try {
      const a = await S.fb.getDoc(S.fb.doc(S.fb.db, "admins", user.email));
      if (!a.exists()) throw { code: "permission-denied" };
    } catch (e) {
      return gate("Chưa có quyền", `Tài khoản <b>${esc(user.email)}</b> chưa được cấp quyền quản trị.<br>Chủ cửa hàng vào <b>Firebase Console → Firestore → admins</b>, thêm tài liệu có mã là email này.`, { logout: true });
    }
    start();
  });
}
function authError(e){
  const c = (e && e.code) || "";
  if (c.includes("popup-closed")) return "";
  if (c.includes("unauthorized-domain")) return "Tên miền này chưa được cho phép trong Firebase → Authentication → Settings → Authorized domains.";
  if (c.includes("operation-not-allowed")) return "Chưa bật đăng nhập Google: Firebase → Authentication → Sign-in method → Google.";
  return (e && e.message) || "Không đăng nhập được.";
}
async function signIn(){
  const { auth, GoogleAuthProvider, signInWithPopup, signInWithRedirect } = S.fb;
  const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, p); }
  catch (e) {
    if (/popup-blocked|operation-not-supported/.test(e.code || "")) return signInWithRedirect(auth, p);
    $("#gate-err").textContent = authError(e);
  }
}

/* ---------------- dữ liệu trực tiếp ---------------- */
function stop(){ S.unsub.forEach(f => f()); S.unsub = []; S.seen = null; }
function start(){
  $("#gate").hidden = true; $("#app").hidden = false;
  $("#who").textContent = S.user.email;
  const { db, collection, query, orderBy, limit, onSnapshot, doc } = S.fb;
  const live = ok => $("#live").classList.toggle("off", !ok);
  S.unsub.push(onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(300)), snap => {
    S.orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const ids = new Set(S.orders.map(o => o.id));
    if (S.seen){ const fresh = S.orders.filter(o => !S.seen.has(o.id)); if (fresh.length) toast(`🛒 Có ${fresh.length} đơn hàng mới: ${fresh[0].code} · ${fmt(fresh[0].total)}`); }
    S.seen = ids; live(true); counts();
    if (S.tab === "orders") renderOrders(); if (S.open) renderDetail(S.open);
  }, e => { live(false); toast("Mất kết nối dữ liệu đơn hàng: " + e.message, true); }));
  S.unsub.push(onSnapshot(query(collection(db, "contacts"), orderBy("createdAt", "desc"), limit(200)), snap => {
    S.contacts = snap.docs.map(d => ({ id: d.id, ...d.data() })); counts(); if (S.tab === "contacts") renderContacts();
  }));
  S.unsub.push(onSnapshot(query(collection(db, "payments"), orderBy("createdAt", "desc"), limit(50)), snap => {
    S.payments = snap.docs.map(d => ({ id: d.id, ...d.data() })); if (S.tab === "payments") renderPayments(); if (S.open) renderDetail(S.open);
  }));
  S.unsub.push(onSnapshot(doc(db, "config", "sepay"), s => { S.sepay = s.exists() ? s.data() : {}; if (S.tab === "payments") renderPayments(); }));
  go(location.hash.slice(1) || "orders");
}
function counts(){
  const n = S.orders.filter(o => o.fulfillment === "new" && o.fulfillment !== "cancelled").length;
  const c = S.contacts.filter(x => !x.handled).length;
  const set = (id, v) => { const el = $(id); el.textContent = v; el.hidden = !v; };
  set("#cnt-orders", n); set("#cnt-contacts", c);
  document.title = (n ? `(${n}) ` : "") + "Quản lý đơn hàng · NMN";
}

/* ---------------- điều hướng ---------------- */
const TITLES = { orders: "Đơn hàng", contacts: "Lời nhắn", payments: "Thanh toán · SePay" };
function go(tab){
  if (!TITLES[tab]) tab = "orders";
  S.tab = tab; history.replaceState(null, "", "#" + tab);
  $$("#nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  $("#title").textContent = TITLES[tab]; document.body.classList.remove("nav-open");
  ({ orders: renderOrders, contacts: renderContacts, payments: renderPayments })[tab]();
}
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
      ${list.length ? `<div class="olist">${list.map(row).join("")}</div>` : `<div class="empty">${S.orders.length ? "Không có đơn phù hợp." : "Chưa có đơn hàng nào. Đơn mới sẽ hiện ở đây ngay khi khách đặt."}</div>`}
    </section>`;
  if (prev){ const i = $("#o-q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
function row(o){
  const c = o.customer || {}, items = (o.items || []).map(i => `${i.name} × ${i.qty}`).join(", ");
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
  const h = e.target.closest("[data-handled]"); if (h) return setHandled(h.dataset.handled, h.dataset.v === "1");
  if (e.target.closest("#sp-gen")) return genKey();
  if (e.target.closest("#sp-save")) return saveSepay();
  const cp = e.target.closest("[data-cp]"); if (cp) return copy(cp.dataset.cp, cp.dataset.cpl || "");
  if (e.target.closest("#sp-show")){ const k = $("#sp-key"); k.type = k.type === "password" ? "text" : "password"; }
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
  card.innerHTML = `
    <div class="od-head"><div><h2 id="od-title">${esc(o.code)}</h2><p class="muted small">${esc(dt(o.createdAt))}</p></div>
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
        ${pays.length ? `<ul class="od-pays">${pays.map(x => `<li>${fmt(x.amount)} · ${esc(x.transactionDate || dt(x.createdAt))} · ${esc(x.gateway || "")}<br><small>${esc(x.content)}</small></li>`).join("")}</ul>` : ""}
        ${p.method === "bank" && st !== "paid" ? `<button type="button" class="btn btn-line btn-sm" id="od-paid">Đánh dấu đã thanh toán</button>` : ""}
      </section>
    </div>
    <section class="od-items"><h3>Sản phẩm</h3>
      <table>${(o.items || []).map(i => `<tr><td>${esc(i.name)}</td><td>${fmt(i.price)} × ${i.qty}</td><td>${fmt(i.lineTotal)}</td></tr>`).join("")}
        <tr class="sum"><td>Tạm tính</td><td></td><td>${fmt(o.subtotal)}</td></tr>
        <tr class="sum"><td>Phí giao hàng</td><td></td><td>${o.shipping == null ? "Báo khi xác nhận" : fmt(o.shipping)}</td></tr>
        <tr class="sum total"><td>Tổng cộng</td><td></td><td>${fmt(o.total)}</td></tr></table>
    </section>
    <section class="od-ful"><h3>Xử lý đơn</h3>
      <div class="fulbtns" role="group" aria-label="Trạng thái đơn">${Object.entries(FUL).map(([k, [l]]) => `<button type="button" class="chip${o.fulfillment === k ? " on" : ""}" data-ful="${k}" aria-pressed="${o.fulfillment === k}">${esc(l)}</button>`).join("")}</div>
      <label class="fl" style="margin-top:12px">Ghi chú nội bộ<textarea id="od-note" rows="2" placeholder="Ví dụ: đã gọi xác nhận, giao GHTK mã …">${esc(o.adminNote || "")}</textarea></label>
      <div class="acts"><button type="button" class="btn btn-ink btn-sm" id="od-save-note">Lưu ghi chú</button></div>
    </section>`;
  if (m.hidden){ m.hidden = false; document.body.classList.add("lock"); card.querySelector("[data-close]").focus(); }
  else if (focusId && $("#" + focusId)) $("#" + focusId).focus();
}
function closeDetail(){ $("#modal").hidden = true; document.body.classList.remove("lock"); const id = S.open; S.open = null; const r = $(`[data-o="${CSS.escape(id || "")}"]`); if (r) r.focus(); }
$("#modal").addEventListener("click", async e => {
  if (e.target.id === "modal" || e.target.closest("[data-close]")) return closeDetail();
  const cp = e.target.closest("[data-cp]"); if (cp) return copy(cp.dataset.cp, cp.dataset.cpl || "");
  const o = S.orders.find(x => x.id === S.open); if (!o) return;
  const { db, doc, updateDoc, writeBatch, serverTimestamp } = S.fb;
  const fu = e.target.closest("[data-ful]");
  if (fu){
    try { await updateDoc(doc(db, "orders", o.id), { fulfillment: fu.dataset.ful, updatedAt: serverTimestamp() }); toast("Đã cập nhật: " + FUL[fu.dataset.ful][0]); }
    catch (err) { toast("Không lưu được: " + err.message, true); }
  }
  if (e.target.closest("#od-save-note")){
    try { await updateDoc(doc(db, "orders", o.id), { adminNote: $("#od-note").value.slice(0, 1000), updatedAt: serverTimestamp() }); toast("Đã lưu ghi chú"); }
    catch (err) { toast("Không lưu được: " + err.message, true); }
  }
  if (e.target.closest("#od-paid")){
    if (!confirm(`Xác nhận đã nhận đủ ${fmt(o.total)} cho đơn ${o.code}?\nChỉ dùng khi bạn đã kiểm tra tiền vào tài khoản.`)) return;
    const p = o.payment || {}, b = writeBatch(db), now = serverTimestamp();
    b.update(doc(db, "orders", o.id), { payment: { ...p, state: "paid", paid: o.total, paidAt: now, manual: true }, updatedAt: now });
    if (p.payCode) b.update(doc(db, "status", p.payCode), { state: "paid", paid: o.total, paidAt: now, manual: true, updatedAt: now });
    try { await b.commit(); toast("Đã đánh dấu đã thanh toán"); } catch (err) { toast("Không lưu được: " + err.message, true); }
  }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#modal").hidden) closeDetail(); });

function csv(){
  const rows = [["Mã đơn", "Thời gian", "Khách hàng", "SĐT", "Email", "Địa chỉ", "Sản phẩm", "Tổng", "Thanh toán", "Trạng thái thanh toán", "Đã nhận", "Xử lý", "Ghi chú khách", "Ghi chú nội bộ"]];
  S.orders.filter(matches).forEach(o => { const c = o.customer || {}, p = o.payment || {};
    rows.push([o.code, dt(o.createdAt), c.name, c.phone, c.email, c.address, (o.items || []).map(i => `${i.name} x ${i.qty}`).join("; "), o.total, p.method === "bank" ? "Chuyển khoản" : "COD", (PAY[payState(o)] || PAY.cod)[0], p.paid || 0, (FUL[o.fulfillment] || FUL.new)[0], c.note, o.adminNote]); });
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
        <small>${esc(ago(c.createdAt))}</small></div>
      ${c.topic || c.product ? `<p class="muted small">${esc([c.topic, c.product].filter(Boolean).join(" · "))}</p>` : ""}
      <p class="cmsg">${esc(c.message)}</p>
      <button type="button" class="btn btn-sm ${c.handled ? "btn-line" : "btn-ink"}" data-handled="${esc(c.id)}" data-v="${c.handled ? 0 : 1}">${c.handled ? "Đánh dấu chưa xử lý" : "Đã xử lý ✓"}</button>
    </article>`; }).join("")}</div>` : `<div class="empty">Chưa có lời nhắn nào từ trang Liên hệ.</div>`}
  </section>`;
}
async function setHandled(id, v){
  const { db, doc, updateDoc, serverTimestamp } = S.fb;
  try { await updateDoc(doc(db, "contacts", id), { handled: v, updatedAt: serverTimestamp() }); } catch (e) { toast("Không lưu được: " + e.message, true); }
}

/* ---------------- THANH TOÁN · SEPAY ---------------- */
function renderPayments(){
  if (S.tab !== "payments") return;
  const sp = S.sepay || {}, url = location.origin + "/api/sepay";
  const keep = $("#sp-key") ? { key: $("#sp-key").value, acc: $("#sp-acc").value, type: $("#sp-key").type } : null;
  $("#view").innerHTML = `
    <section class="card"><h2>Kết nối SePay — xác nhận chuyển khoản tự động</h2>
      <p class="desc">Khi tiền vào tài khoản, SePay gửi thông báo tới website; đơn có nội dung chuyển khoản trùng mã sẽ tự chuyển sang <b>Đã thanh toán</b> và trang của khách cập nhật ngay.</p>
      <div class="fgrid">
        <div class="f full"><span class="lbl">URL webhook (dán vào SePay)</span><div class="cpy"><code>${esc(url)}</code><button type="button" class="btn btn-line btn-sm" data-cp="${esc(url)}" data-cpl="URL webhook">Sao chép</button></div></div>
        <div class="f full"><label for="sp-key">Khoá API (API Key) cho webhook</label>
          <div class="cpy"><input id="sp-key" type="${keep ? keep.type : "password"}" spellcheck="false" autocomplete="off" value="${esc(keep ? keep.key : sp.webhookKey || "")}" placeholder="Bấm “Tạo khoá mới”">
            <button type="button" class="btn btn-line btn-sm" id="sp-show">Hiện/ẩn</button>
            <button type="button" class="btn btn-line btn-sm" data-cp="${esc(sp.webhookKey || "")}" data-cpl="khoá API" ${sp.webhookKey ? "" : "disabled"}>Sao chép</button>
            <button type="button" class="btn btn-line btn-sm" id="sp-gen">Tạo khoá mới</button></div>
          <span class="hint">Chỉ dán khoá này vào SePay. Đổi khoá → nhớ cập nhật lại bên SePay.</span></div>
        <div class="f"><label for="sp-acc">Số tài khoản nhận tiền</label><input id="sp-acc" inputmode="numeric" value="${esc(keep ? keep.acc : sp.account || "")}" placeholder="0985233655"><span class="hint">Chỉ tính giao dịch vào tài khoản này (để trống = mọi tài khoản trong SePay).</span></div>
      </div>
      <div class="acts" style="justify-content:flex-start"><button type="button" class="btn btn-ink" id="sp-save">Lưu cài đặt</button>
        <span class="muted small">${sp.webhookKey ? "✓ Đã bật nhận webhook" + (sp.updatedAt ? " · cập nhật " + esc(dt(sp.updatedAt)) : "") : "Chưa có khoá — website đang từ chối mọi webhook."}</span></div>
    </section>
    <section class="card"><h2>Cài trong SePay</h2>
      <ol class="tips">
        <li>my.sepay.vn → <b>Ngân hàng</b>: kết nối tài khoản nhận tiền (ví dụ MB Bank 0985233655).</li>
        <li><b>Tích hợp WebHooks → + Thêm webhooks</b>: Sự kiện <i>Có tiền vào</i>; Gọi đến URL: <b>URL webhook</b> ở trên; Kiểu chứng thực: <b>API Key</b>, dán <b>Khoá API</b>; Content-Type <code>application/json</code>.</li>
        <li>(Khuyên dùng) <b>Cấu hình công ty → Cấu trúc mã thanh toán</b>: tiền tố <code>NMN</code>.</li>
        <li>CMS → Cài đặt chung → Chuyển khoản: bật <b>Tự động xác nhận đã thanh toán (SePay)</b> → Xuất bản.</li>
        <li>Thử: đặt sản phẩm test 5.000đ, chuyển khoản → giao dịch hiện ở bảng dưới, đơn chuyển sang Đã thanh toán.</li>
      </ol>
    </section>
    <section class="card"><h2>Giao dịch gần đây</h2>
      ${S.payments.length ? `<div class="plist">${S.payments.map(x => `<div class="prow"><span><b>${fmt(x.amount)}</b> ${x.matched ? `<span class="badge on">Đơn ${esc(x.orderCode)}</span>` : x.incoming ? `<span class="badge warn">Không khớp đơn</span>` : `<span class="badge off">Tiền ra / bỏ qua</span>`}</span>
        <small>${esc(x.transactionDate || dt(x.createdAt))} · ${esc(x.gateway || "")}</small><span class="pc">${esc(x.content)}</span></div>`).join("")}</div>` : `<div class="empty">Chưa nhận giao dịch nào từ SePay.</div>`}
    </section>`;
}
function genKey(){
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  const k = "nmn_" + [...a].map(b => b.toString(16).padStart(2, "0")).join("");
  const i = $("#sp-key"); i.value = k; i.type = "text"; toast("Đã tạo khoá mới — bấm Lưu cài đặt");
}
async function saveSepay(){
  const key = $("#sp-key").value.trim(), acc = $("#sp-acc").value.replace(/\D/g, "");
  if (key && key.length < 20) return toast("Khoá quá ngắn (tối thiểu 20 ký tự). Bấm “Tạo khoá mới”.", true);
  const { db, doc, setDoc, serverTimestamp } = S.fb;
  try { await setDoc(doc(db, "config", "sepay"), { webhookKey: key, account: acc, updatedAt: serverTimestamp() }); toast("Đã lưu cài đặt SePay"); }
  catch (e) { toast("Không lưu được: " + e.message, true); }
}

boot().catch(e => gate("Có lỗi", "Không khởi động được trang quản lý.", { err: e.message }));
