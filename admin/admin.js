/* =====================================================================
   NMN CMS · admin.js
   Quản trị nội dung website, lưu trực tiếp vào repo GitHub (không cần máy chủ).
   - Đọc/ghi các file content/*.json và ảnh trong images/
   - Mỗi lần "Xuất bản" tạo đúng 1 commit chứa mọi thay đổi
   ===================================================================== */
(() => {
"use strict";

/* ---------- cấu hình mặc định ---------- */
const DEFAULTS = { owner: "lequyducmanh", repo: "nmn-website", branch: "main" };
const FILES = ["site", "products", "posts", "events"];
const FILE_LABEL = { site: "Cài đặt & Trang chủ", products: "Sản phẩm", posts: "Bài viết", events: "Sự kiện" };
const SITE_BASE = new URL("../", location.href).href;
const API = "https://api.github.com";
const MAX_IMG = 1600;              // cạnh dài tối đa sau khi nén
const MAX_FILE = 20 * 1024 * 1024; // 20MB

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = n => new Intl.NumberFormat("vi-VN").format(Math.round(Number(n) || 0)) + "đ";
const clone = o => JSON.parse(JSON.stringify(o));
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const slugify = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
const store = {
  get(k, area = localStorage){ try { return area.getItem(k); } catch (_) { return null; } },
  set(k, v, area = localStorage){ try { area.setItem(k, v); return true; } catch (_) { return false; } },
  del(k){ try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (_) {} }
};
function getP(o, path){ return path.split(".").reduce((a, k) => a == null ? a : a[k], o); }
function setP(o, path, v){ const ks = path.split("."); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] == null ? (a[k] = {}) : a[k]), o); t[last] = v; }

/* ---------- state ---------- */
const S = {
  cfg: { ...DEFAULTS }, token: "",
  data: {}, shas: {}, head: null,
  images: [],                 // [{path,size}] đã có trong repo
  dirty: new Set(),           // file JSON đã sửa
  uploads: new Map(),         // path → {b64,dataUrl,size} ảnh mới chờ xuất bản
  deletes: new Set(),         // path ảnh sẽ xoá
  shown: new Map(),           // path → dataUrl (ảnh vừa xuất bản, chờ GitHub Pages cập nhật)
  view: "overview", editing: null, ctx: null,
  autoSlug: new WeakSet(), readManual: new WeakSet()
};
const changeCount = () => S.dirty.size + S.uploads.size + S.deletes.size;

/* ---------- UI primitives ---------- */
function toast(msg, bad){ const t = $("#toast"); t.textContent = msg; t.classList.toggle("bad", !!bad); t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), bad ? 5200 : 2800); }
function busy(on, text){ $("#busy").hidden = !on; if (text) $("#busy-text").textContent = text; }
let modalResolve = null;
function openModal(html, cls = ""){
  const m = $("#modal"), c = $("#modal-card");
  c.className = "modal-card " + cls; c.innerHTML = html; m.hidden = false; document.body.classList.add("lock");
  setTimeout(() => { const f = c.querySelector("[autofocus], input, button.btn-ink, button"); if (f) f.focus(); }, 30);
  return new Promise(r => { modalResolve = r; });
}
function closeModal(v){ $("#modal").hidden = true; document.body.classList.remove("lock"); const r = modalResolve; modalResolve = null; if (r) r(v); }
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(null); const b = e.target.closest("[data-mv]"); if (b) closeModal(b.dataset.mv === "1" ? true : b.dataset.mv === "0" ? false : b.dataset.mv); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(null); });
const confirmModal = (title, html, ok = "Đồng ý", danger = false) => openModal(`<h2>${esc(title)}</h2><div class="muted">${html}</div>
  <div class="acts"><button class="btn btn-line" data-mv="0">Huỷ</button><button class="btn ${danger ? "btn-danger" : "btn-ink"}" data-mv="1">${esc(ok)}</button></div>`, "sm").then(v => v === true);
const alertModal = (title, html) => openModal(`<h2>${esc(title)}</h2><div>${html}</div><div class="acts"><button class="btn btn-ink" data-mv="1">Đã hiểu</button></div>`, "sm");
function promptModal(title, label, value = ""){
  const p = openModal(`<h2>${esc(title)}</h2><form id="pm" class="f"><label for="pm-in">${esc(label)}</label><input type="text" id="pm-in" value="${esc(value)}" autofocus>
    <div class="acts"><button type="button" class="btn btn-line" data-mv="0">Huỷ</button><button class="btn btn-ink" type="submit">OK</button></div></form>`, "sm");
  $("#pm").addEventListener("submit", e => { e.preventDefault(); closeModal($("#pm-in").value.trim()); });
  return p.then(v => typeof v === "string" ? v : null);
}

/* =====================================================================
   GITHUB API
   ===================================================================== */
async function gh(path, opts = {}){
  const r = await fetch(API + path, {
    method: opts.method || "GET", cache: "no-store",
    headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + S.token, "X-GitHub-Api-Version": "2022-11-28", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!r.ok){
    let m = ""; try { m = (await r.json()).message || ""; } catch (_) {}
    const e = new Error(m || r.statusText); e.status = r.status; throw e;
  }
  return r.status === 204 ? null : r.json();
}
const repoPath = p => `/repos/${encodeURIComponent(S.cfg.owner)}/${encodeURIComponent(S.cfg.repo)}${p}`;
const decodeB64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, "")), c => c.charCodeAt(0)));
function apiError(e){
  if (e.status === 401) return "Mã truy cập không hợp lệ hoặc đã hết hạn.";
  if (e.status === 403) return "Mã truy cập không đủ quyền (cần Contents: Read and write cho repo này)." + (e.message ? ` (${e.message})` : "");
  if (e.status === 404) return `Không tìm thấy repo ${S.cfg.owner}/${S.cfg.repo} hoặc nhánh ${S.cfg.branch}, hoặc mã không được cấp quyền cho repo này.`;
  if (e.status === 409 || e.status === 422) return "Repo vừa thay đổi trong lúc xuất bản. Vui lòng thử lại.";
  if (e instanceof TypeError) return "Không kết nối được tới GitHub. Kiểm tra mạng rồi thử lại.";
  return e.message || "Đã có lỗi xảy ra.";
}

async function loadAll(){
  const repo = await gh(repoPath(""));
  if (repo.permissions && repo.permissions.push === false) { const e = new Error("no push"); e.status = 403; throw e; }
  const ref = await gh(repoPath(`/git/ref/heads/${encodeURIComponent(S.cfg.branch)}`));
  const commit = await gh(repoPath(`/git/commits/${ref.object.sha}`));
  const tree = await gh(repoPath(`/git/trees/${commit.tree.sha}?recursive=1`));
  const data = {}, shas = {};
  for (const f of FILES){
    const ent = tree.tree.find(t => t.path === `content/${f}.json`);
    if (!ent) { data[f] = f === "site" ? {} : []; shas[f] = null; continue; }
    const blob = await gh(repoPath(`/git/blobs/${ent.sha}`));
    data[f] = JSON.parse(decodeB64(blob.content));
    shas[f] = ent.sha;
  }
  S.data = data; S.shas = shas; S.head = ref.object.sha;
  S.lastCommit = { sha: ref.object.sha, date: commit.committer && commit.committer.date, msg: commit.message };
  S.images = tree.tree.filter(t => t.type === "blob" && /^images\//.test(t.path) && /\.(jpe?g|png|webp|gif|avif|svg)$/i.test(t.path)).map(t => ({ path: t.path, size: t.size }));
  S.dirty.clear(); S.uploads.clear(); S.deletes.clear();
  normalize();
}
/* đảm bảo mọi trường cần thiết đều có */
function normalize(){
  const s = S.data.site;
  s.bank = s.bank || { code: "", account: "", owner: "", name: "" };
  s.seo = s.seo || { title: "", description: "" };
  s.home = s.home || {};
  ["perks"].forEach(k => s[k] = Array.isArray(s[k]) ? s[k] : []);
  ["heroMeta", "marquee"].forEach(k => s.home[k] = Array.isArray(s.home[k]) ? s.home[k] : []);
  S.data.products.forEach(p => { p.gallery = p.gallery || []; p.highlights = p.highlights || []; p.specs = p.specs || []; p.usage = p.usage || []; p.homeSpecs = p.homeSpecs || []; if (p.visible === undefined) p.visible = true; });
  S.data.posts.forEach(p => { if (p.published === undefined) p.published = true; });
  S.data.events.forEach(e => { if (e.published === undefined) e.published = true; });
}

/* =====================================================================
   ĐĂNG NHẬP
   ===================================================================== */
function readCfg(){
  try { const c = JSON.parse(store.get("nmn_cms_cfg") || "null"); if (c && c.owner) S.cfg = { ...DEFAULTS, ...c }; } catch (_) {}
  $("#cfg-owner").value = S.cfg.owner; $("#cfg-repo").value = S.cfg.repo; $("#cfg-branch").value = S.cfg.branch;
  $("#howto-repo").textContent = S.cfg.repo;
}
async function login(token, remember){
  S.token = token;
  busy(true, "Đang kết nối GitHub…");
  try {
    await loadAll();
    store.del("nmn_cms_token");
    store.set("nmn_cms_token", token, remember ? localStorage : sessionStorage);
    store.set("nmn_cms_cfg", JSON.stringify(S.cfg));
    $("#login").hidden = true; $("#app").hidden = false;
    $("#who").innerHTML = `Repo: <b>${esc(S.cfg.owner)}/${esc(S.cfg.repo)}</b> · nhánh ${esc(S.cfg.branch)}`;
    $("#site-link").href = SITE_BASE;
    go(location.hash.slice(1) || "overview");
    return true;
  } catch (e){
    S.token = "";
    $("#login-err").textContent = apiError(e);
    return false;
  } finally { busy(false); }
}
$("#login-form").addEventListener("submit", async e => {
  e.preventDefault();
  $("#login-err").textContent = "";
  S.cfg = { owner: $("#cfg-owner").value.trim() || DEFAULTS.owner, repo: $("#cfg-repo").value.trim() || DEFAULTS.repo, branch: $("#cfg-branch").value.trim() || DEFAULTS.branch };
  const tk = $("#tk").value.trim();
  if (!tk) { $("#login-err").textContent = "Vui lòng nhập mã truy cập."; return; }
  if (await login(tk, $("#remember").checked)) $("#tk").value = "";
});
$("#logout").addEventListener("click", async () => {
  if (changeCount() && !(await confirmModal("Đăng xuất?", "Các thay đổi chưa xuất bản sẽ bị mất.", "Đăng xuất", true))) return;
  store.del("nmn_cms_token"); S.token = ""; S.dirty.clear(); S.uploads.clear(); S.deletes.clear();
  location.hash = ""; location.reload();
});

/* =====================================================================
   ĐIỀU HƯỚNG
   ===================================================================== */
const TITLES = { overview: "Tổng quan", settings: "Cài đặt chung", home: "Trang chủ", products: "Sản phẩm", posts: "Bài viết", events: "Sự kiện", media: "Thư viện ảnh" };
$("#nav").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) { location.hash = b.dataset.view; document.body.classList.remove("nav-open"); } });
$("#menu-btn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
$("#side-ov").addEventListener("click", () => document.body.classList.remove("nav-open"));
addEventListener("hashchange", () => { if (S.token) go(location.hash.slice(1) || "overview"); });
function go(h){
  const [view, idx] = h.split("/");
  if (!TITLES[view]) return go("overview");
  S.view = view; S.editing = idx != null && idx !== "" ? idx : null;
  $$("#nav [data-view]").forEach(b => b.classList.toggle("on", b.dataset.view === view));
  render();
  $("#view").focus({ preventScroll: true }); window.scrollTo(0, 0);
}
function render(){
  const v = S.view;
  let title = TITLES[v];
  if (v === "overview") viewOverview();
  else if (v === "settings") viewForm("site", S.data.site, SETTINGS_SECTIONS);
  else if (v === "home") viewForm("site", S.data.site, HOME_SECTIONS);
  else if (v === "media") viewMedia();
  else if (COLL[v]){
    if (S.editing != null){
      const item = COLL[v].find(S.editing);
      if (!item){ location.hash = v; return; }
      title = COLL[v].title(item) || TITLES[v];
      viewEdit(v, item);
    } else viewList(v);
  }
  $("#title").textContent = title;
  document.title = title + " · Quản trị NMN";
  paintDirty();
  autosizeAll();
}
function paintDirty(){
  const n = changeCount();
  $("#dirty").hidden = !n; $("#dirty").textContent = `${n} thay đổi chưa xuất bản`;
  $("#publish-btn").disabled = !n;
  const cnt = { products: S.data.products.length, posts: S.data.posts.length, events: S.data.events.length, media: S.images.length + S.uploads.size - S.deletes.size };
  $$("#nav [data-view]").forEach(b => { const c = cnt[b.dataset.view]; let n = b.querySelector(".n"); if (c == null) return; if (!n){ n = document.createElement("span"); n.className = "n"; b.appendChild(n); } n.textContent = c; });
}
function markDirty(file){ S.dirty.add(file); paintDirty(); }
addEventListener("beforeunload", e => { if (changeCount()){ e.preventDefault(); e.returnValue = ""; } });

/* =====================================================================
   ẢNH: nén, hiển thị, chọn
   ===================================================================== */
function displayUrl(path){
  if (!path) return "";
  if (/^(https?:|data:)/.test(path)) return path;
  const u = S.uploads.get(path); if (u) return u.dataUrl;
  return S.shown.get(path) || SITE_BASE + path;
}
const thumbHtml = (path, empty = "Chưa có ảnh") => `<div class="thumb">${path ? `<img src="${esc(displayUrl(path))}" alt="" loading="lazy">${S.uploads.has(path) ? '<span class="pend">Mới</span>' : ""}` : esc(empty)}</div>`;
function pickFiles(multiple = false){
  return new Promise(res => {
    const inp = $("#file-pick"); inp.multiple = multiple; inp.value = "";
    const done = () => { inp.removeEventListener("change", done); res([...inp.files]); };
    inp.addEventListener("change", done); inp.click();
  });
}
function blobToDataURL(b){ return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); }); }
async function decodeImage(file){
  if (window.createImageBitmap){ try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (_) {} }
  const url = URL.createObjectURL(file);
  try { const im = new Image(); im.src = url; await im.decode(); return im; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
async function processImage(file, folder){
  if (!/^image\//.test(file.type)) throw new Error(`"${file.name}" không phải file ảnh.`);
  if (file.size > MAX_FILE) throw new Error(`"${file.name}" lớn hơn 20MB.`);
  const src = await decodeImage(file);
  const w0 = src.width, h0 = src.height, k = Math.min(1, MAX_IMG / Math.max(w0, h0));
  const cv = document.createElement("canvas"); cv.width = Math.round(w0 * k); cv.height = Math.round(h0 * k);
  const g = cv.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, cv.width, cv.height);
  let blob = await new Promise(r => cv.toBlob(r, "image/webp", .85));
  if (!blob || blob.type !== "image/webp"){
    const c2 = document.createElement("canvas"); c2.width = cv.width; c2.height = cv.height;
    const g2 = c2.getContext("2d"); g2.fillStyle = "#fff"; g2.fillRect(0, 0, c2.width, c2.height); g2.drawImage(cv, 0, 0);
    blob = await new Promise(r => c2.toBlob(r, "image/jpeg", .86));
  }
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const d = new Date(), stamp = [d.getFullYear() % 100, d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, "0")).join("");
  const base = slugify(file.name.replace(/\.[^.]+$/, "")) || "anh";
  let path = `images/${folder}/${base}-${stamp}.${ext}`, i = 2;
  while (S.uploads.has(path) || S.images.some(x => x.path === path)) path = `images/${folder}/${base}-${stamp}-${i++}.${ext}`;
  const dataUrl = await blobToDataURL(blob);
  S.uploads.set(path, { b64: dataUrl.split(",")[1], dataUrl, size: blob.size });
  paintDirty();
  return path;
}
async function uploadFlow(folder, multiple){
  const files = await pickFiles(multiple);
  if (!files.length) return [];
  busy(true, "Đang nén ảnh…");
  const out = [];
  try { for (const f of files) out.push(await processImage(f, folder)); }
  catch (e){ toast(e.message, true); }
  finally { busy(false); }
  if (out.length) toast(`Đã thêm ${out.length} ảnh (sẽ tải lên khi Xuất bản)`);
  return out;
}
function allImages(){
  const list = S.images.filter(x => !S.deletes.has(x.path)).map(x => ({ ...x, pending: false }));
  S.uploads.forEach((u, p) => list.unshift({ path: p, size: u.size, pending: true }));
  return list;
}
function usage(path){ let n = 0; FILES.forEach(f => { const s = JSON.stringify(S.data[f]); n += s.split(path).length - 1; }); return n; }
async function pickFromLibrary(){
  const imgs = allImages();
  const p = openModal(`<h2>Chọn ảnh từ thư viện</h2>
    ${imgs.length ? `<div class="media">${imgs.map(m => `<div class="mi pick" data-mv="${esc(m.path)}" role="button" tabindex="0">${thumbHtml(m.path)}<div class="mm"><div class="nm">${esc(m.path.split("/").pop())}</div></div></div>`).join("")}</div>`
      : `<p class="empty">Thư viện chưa có ảnh nào. Hãy tải ảnh lên trước.</p>`}
    <div class="acts"><button class="btn btn-line" data-mv="0">Đóng</button></div>`);
  const v = await p;
  return typeof v === "string" ? v : null;
}

/* =====================================================================
   RICH TEXT (soạn thảo bài viết)
   ===================================================================== */
const ALLOWED = { P:1, H2:1, H3:1, H4:1, STRONG:1, B:1, EM:1, I:1, U:1, UL:1, OL:1, LI:1, BLOCKQUOTE:1, A:1, IMG:1, BR:1, DIV:1, TABLE:1, THEAD:1, TBODY:1, TR:1, TH:1, TD:1, FIGURE:1, FIGCAPTION:1, SPAN:1 };
const DROP = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM|INPUT|BUTTON|SELECT|TEXTAREA|SVG|META|LINK|NOSCRIPT|TEMPLATE)$/;
const CLASSES = ["note", "refs", "tbl"];
function sanitize(root){
  [...root.childNodes].forEach(n => {
    if (n.nodeType === 8) { n.remove(); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (DROP.test(tag)) { n.remove(); return; }
    sanitize(n);
    const cls = (n.getAttribute("class") || "").split(/\s+/).filter(c => CLASSES.includes(c));
    if (!ALLOWED[tag] || ((tag === "SPAN" || tag === "DIV") && !cls.length)){
      if (tag === "DIV" && !cls.length && n.textContent.trim()){ const p = document.createElement("p"); while (n.firstChild) p.appendChild(n.firstChild); n.replaceWith(p); return; }
      n.replaceWith(...n.childNodes); return;
    }
    [...n.attributes].forEach(a => {
      const nm = a.name.toLowerCase();
      const keep = (tag === "A" && ["href", "target", "rel"].includes(nm)) || (tag === "IMG" && ["src", "alt"].includes(nm)) || nm === "class";
      if (!keep) n.removeAttribute(a.name);
    });
    if (cls.length) n.setAttribute("class", cls.join(" ")); else n.removeAttribute("class");
    if (tag === "A"){
      const href = n.getAttribute("href") || "";
      if (!/^(https?:|mailto:|tel:|#)/i.test(href)) n.removeAttribute("href");
      if (/^https?:/i.test(href)) { n.setAttribute("target", "_blank"); n.setAttribute("rel", "noopener"); }
    }
    if (tag === "IMG"){
      const src = n.getAttribute("src") || "";
      if (!/^(images\/|https:)/.test(src)) n.remove();
      else if (!n.hasAttribute("alt")) n.setAttribute("alt", "");
    }
  });
  return root;
}
function toEditor(html){
  const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
  const box = doc.body.firstChild;
  box.querySelectorAll("img").forEach(im => { const s = im.getAttribute("src") || ""; if (s.startsWith("images/")) { im.setAttribute("data-path", s); im.setAttribute("src", displayUrl(s)); } });
  return box.innerHTML;
}
function fromEditor(el){
  const box = el.cloneNode(true);
  box.querySelectorAll("img[data-path]").forEach(im => { im.setAttribute("src", im.getAttribute("data-path")); im.removeAttribute("data-path"); });
  sanitize(box);
  return box.innerHTML.replace(/(<p>(\s|<br>|&nbsp;)*<\/p>\s*)+$/g, "").trim();
}
const RTE_TOOLS = [["p", "Đoạn"], ["h2", "H2"], ["h3", "H3"], ["|"], ["b", "<b>B</b>"], ["i", "<i>I</i>"], ["|"], ["ul", "• Danh sách"], ["ol", "1. Danh sách"], ["quote", "❝ Trích dẫn"], ["note", "! Ghi chú"], ["|"], ["link", "🔗 Liên kết"], ["img", "🖼 Ảnh"], ["clear", "Xoá định dạng"], ["|"], ["src", "HTML"]];
function rteHtml(key, html){
  return `<div class="rte" data-rte="${esc(key)}">
    <div class="rte-bar" role="toolbar">${RTE_TOOLS.map(([c, l]) => c === "|" ? '<span class="sep"></span>' : `<button type="button" data-cmd="${c}" title="${esc(l.replace(/<[^>]+>/g, ""))}">${l}</button>`).join("")}</div>
    <div class="rte-ed" contenteditable="true" spellcheck="true">${toEditor(html)}</div>
  </div>`;
}
let savedRange = null;
function saveSel(){ const s = getSelection(); savedRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null; }
function restoreSel(ed){ ed.focus(); if (savedRange){ const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); } }
function syncRte(rte){
  const key = rte.dataset.rte, ed = rte.querySelector(".rte-ed"), src = rte.querySelector(".rte-src");
  const html = src ? (() => { const d = document.createElement("div"); d.innerHTML = src.value; return fromEditor(d); })() : fromEditor(ed);
  setP(S.ctx.obj, key, html);
  if (S.ctx.file === "posts" && !S.readManual.has(S.ctx.obj)){
    const words = (html.replace(/<[^>]+>/g, " ").match(/\S+/g) || []).length;
    S.ctx.obj.read = Math.max(1, Math.round(words / 220));
    const r = $('[data-k="read"]'); if (r) r.value = S.ctx.obj.read;
  }
  markDirty(S.ctx.file);
}
async function rteCmd(btn){
  const rte = btn.closest(".rte"), ed = rte.querySelector(".rte-ed"), cmd = btn.dataset.cmd;
  if (cmd === "src"){
    const src = rte.querySelector(".rte-src");
    if (src){ const d = document.createElement("div"); d.innerHTML = src.value; ed.innerHTML = toEditor(fromEditor(d)); src.remove(); ed.hidden = false; btn.classList.remove("on"); }
    else { const ta = document.createElement("textarea"); ta.className = "rte-src"; ta.value = fromEditor(ed).replace(/></g, ">\n<"); ed.hidden = true; ed.after(ta); btn.classList.add("on"); ta.focus(); }
    return;
  }
  if (rte.querySelector(".rte-src")) { toast("Đang ở chế độ HTML — bấm HTML để quay lại soạn thảo"); return; }
  restoreSel(ed);
  document.execCommand("defaultParagraphSeparator", false, "p");
  const block = t => document.execCommand("formatBlock", false, `<${t}>`);
  if (cmd === "p" || cmd === "h2" || cmd === "h3") block(cmd);
  else if (cmd === "b") document.execCommand("bold");
  else if (cmd === "i") document.execCommand("italic");
  else if (cmd === "ul") document.execCommand("insertUnorderedList");
  else if (cmd === "ol") document.execCommand("insertOrderedList");
  else if (cmd === "quote") block("blockquote");
  else if (cmd === "clear"){ document.execCommand("removeFormat"); block("p"); }
  else if (cmd === "note"){
    block("p");
    let n = getSelection().anchorNode; while (n && n !== ed && !(n.nodeType === 1 && n.tagName === "P")) n = n.parentNode;
    if (n && n !== ed) n.classList.toggle("note");
  }
  else if (cmd === "link"){
    saveSel();
    const url = await promptModal("Chèn liên kết", "Địa chỉ (https://…, tel:…, mailto:…)", "https://");
    if (!url) return;
    restoreSel(ed);
    if (getSelection().isCollapsed) document.execCommand("insertHTML", false, `<a href="${esc(url)}">${esc(url)}</a>`);
    else document.execCommand("createLink", false, url);
  }
  else if (cmd === "img"){
    saveSel();
    const folder = S.ctx.file === "events" ? "events" : "posts";
    const [path] = await uploadFlow(folder, false);
    if (!path) return;
    restoreSel(ed);
    document.execCommand("insertHTML", false, `<p><img src="${esc(displayUrl(path))}" data-path="${esc(path)}" alt=""></p>`);
  }
  syncRte(rte);
}

/* =====================================================================
   FORM BUILDER
   field: { k: key, t: type, l: label, hint, req, ph, opts, full, nullable }
   ===================================================================== */
function fieldHtml(d, obj){
  const v = getP(obj, d.k);
  const id = "f-" + d.k.replace(/\W/g, "-");
  const lab = `<label for="${id}">${esc(d.l)}${d.req ? " <i>*</i>" : ""}${d.hint ? ` <span class="hint">${d.hint}</span>` : ""}</label>`;
  const attrs = `id="${id}" data-k="${esc(d.k)}" data-t="${d.t}"${d.ph ? ` placeholder="${esc(d.ph)}"` : ""}`;
  let inner = "";
  switch (d.t){
    case "text": case "emph": case "url": case "tel": case "email": case "slug":
      inner = lab + `<input type="${d.t === "url" || d.t === "tel" || d.t === "email" ? d.t : "text"}" ${attrs} value="${esc(v)}" spellcheck="${d.t === "slug" ? "false" : "true"}">`;
      if (d.t === "emph") inner += `<span class="hint">Mẹo: đặt chữ trong *dấu sao* để hiện chữ nghiêng màu vàng.</span>`;
      break;
    case "textarea": inner = lab + `<textarea ${attrs} rows="${d.rows || 3}">${esc(v)}</textarea>`; break;
    case "number": case "money":
      inner = lab + `<input type="number" inputmode="numeric" step="${d.t === "money" ? 1000 : 1}" min="0" ${attrs} value="${v == null ? "" : esc(v)}">`;
      if (d.t === "money") inner += `<span class="hint" data-money="${esc(d.k)}">${v == null || v === "" ? (d.nullable ? esc(d.nullLabel || "Để trống") : "") : "= " + fmt(v)}</span>`;
      break;
    case "date": inner = lab + `<input type="date" ${attrs} value="${esc(v)}">`; break;
    case "select": inner = lab + `<select ${attrs}>${d.opts.map(([val, l]) => `<option value="${esc(val)}"${String(v) === String(val) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`; break;
    case "toggle": inner = `<span class="lbl">&nbsp;</span><label class="toggle"><input type="checkbox" ${attrs}${v ? " checked" : ""}> ${esc(d.l)}</label>${d.hint ? `<span class="hint">${d.hint}</span>` : ""}`; break;
    case "lines": inner = lab + `<textarea ${attrs} rows="${Math.max(3, (v || []).length + 1)}">${esc((v || []).join("\n"))}</textarea><span class="hint">Mỗi dòng một mục.</span>`; break;
    case "pairs":
      inner = `<span class="lbl">${esc(d.l)}${d.hint ? ` <span class="hint">${d.hint}</span>` : ""}</span>
        <div class="pairs" data-k="${esc(d.k)}" data-t="pairs">${(v || []).map((p, i) => `<div class="pair"><input value="${esc(p[0])}" placeholder="${esc(d.ph1 || "Tên")}" data-pi="${i}" data-pj="0"><input value="${esc(p[1])}" placeholder="${esc(d.ph2 || "Giá trị")}" data-pi="${i}" data-pj="1"><button type="button" class="x" data-pair-rm="${i}" aria-label="Xoá dòng">✕</button></div>`).join("")}</div>
        <div><button type="button" class="btn btn-line btn-sm" data-pair-add="${esc(d.k)}">+ Thêm dòng</button></div>`;
      break;
    case "image":
      inner = `<span class="lbl">${esc(d.l)}${d.hint ? ` <span class="hint">${d.hint}</span>` : ""}</span>
        <div class="imgf">${thumbHtml(v, d.empty || "Chưa có ảnh")}
          <div class="acts"><button type="button" class="btn btn-ink btn-sm" data-img-up="${esc(d.k)}" data-folder="${esc(d.folder || "misc")}">Tải ảnh lên</button>
          <button type="button" class="btn btn-line btn-sm" data-img-lib="${esc(d.k)}">Chọn từ thư viện</button>
          ${v ? `<button type="button" class="btn btn-danger btn-sm" data-img-clear="${esc(d.k)}">Bỏ ảnh</button>` : ""}</div>
          ${v ? `<div class="path">${esc(v)}</div>` : ""}</div>`;
      break;
    case "gallery":
      inner = `<span class="lbl">${esc(d.l)}${d.hint ? ` <span class="hint">${d.hint}</span>` : ""}</span>
        <div class="gal">${(v || []).map((p, i) => `<div class="g">${thumbHtml(p)}<div class="ga"><button type="button" data-gal-mv="${esc(d.k)}|${i}|-1" aria-label="Sang trái">◀</button><button type="button" data-gal-rm="${esc(d.k)}|${i}" aria-label="Xoá">✕</button><button type="button" data-gal-mv="${esc(d.k)}|${i}|1" aria-label="Sang phải">▶</button></div></div>`).join("")}
          <button type="button" class="add" data-gal-up="${esc(d.k)}" data-folder="${esc(d.folder || "misc")}">+ Tải lên</button>
          <button type="button" class="add" data-gal-lib="${esc(d.k)}">+ Thư viện</button></div>`;
      break;
    case "rich": inner = `<span class="lbl">${esc(d.l)}${d.hint ? ` <span class="hint">${d.hint}</span>` : ""}</span>` + rteHtml(d.k, v); break;
  }
  return `<div class="f${d.full || ["textarea", "lines", "pairs", "image", "gallery", "rich"].includes(d.t) ? " full" : ""}" data-field="${esc(d.k)}">${inner}<span class="msg"></span></div>`;
}
function sectionsHtml(sections, obj){
  return sections.map(sec => `<section class="card">${sec.h ? `<h2>${esc(sec.h)}</h2>` : ""}${sec.d ? `<p class="desc">${sec.d}</p>` : ""}<div class="fgrid">${sec.f.map(d => fieldHtml(d, obj)).join("")}</div></section>`).join("");
}
function rerenderField(key){
  const d = S.ctx.defs[key], el = $(`[data-field="${CSS.escape(key)}"]`);
  if (d && el){ el.outerHTML = fieldHtml(d, S.ctx.obj); autosizeAll(); }
}
/* ô nhập nhiều dòng tự giãn theo nội dung */
function autosize(t){ if (!t || t.tagName !== "TEXTAREA" || t.classList.contains("rte-src")) return; t.style.height = "auto"; t.style.height = (t.scrollHeight + 2) + "px"; }
function autosizeAll(){ requestAnimationFrame(() => $$("#view textarea").forEach(autosize)); }
function bindCtx(file, obj, sections){
  const defs = {}; sections.forEach(s => s.f.forEach(d => defs[d.k] = d));
  S.ctx = { file, obj, defs };
}

/* ---------- form events (delegated) ---------- */
const view = $("#view");
/* slug của mục đang sửa thay đổi → cập nhật dữ liệu và địa chỉ trang sửa */
function slugChanged(s){
  const ctx = S.ctx; if (!ctx) return;
  ctx.obj.slug = s; markDirty(ctx.file);
  if (COLL[S.view] && S.editing != null){ S.editing = s; history.replaceState(null, "", `#${S.view}/${s}`); }
}
view.addEventListener("input", e => {
  const t = e.target, ctx = S.ctx; if (!ctx) return;
  autosize(t);
  if (t.closest(".rte")) { clearTimeout(t._sync); const rte = t.closest(".rte"); t._sync = setTimeout(() => syncRte(rte), 250); return; }
  if (t.dataset.pi != null){
    const box = t.closest(".pairs"), key = box.dataset.k;
    const rows = $$(".pair", box).map(r => $$("input", r).map(i => i.value));
    setP(ctx.obj, key, rows); markDirty(ctx.file); return;
  }
  const k = t.dataset.k, ty = t.dataset.t; if (!k) return;
  let v = t.value;
  if (ty === "number" || ty === "money"){
    const d = ctx.defs[k];
    v = v === "" ? (d && d.nullable ? null : 0) : Number(v);
    const h = $(`[data-money="${CSS.escape(k)}"]`); if (h) h.textContent = v == null ? (d.nullLabel || "Để trống") : "= " + fmt(v);
    if (k === "read" && ctx.file === "posts") S.readManual.add(ctx.obj);
  }
  else if (ty === "toggle") v = t.checked;
  else if (ty === "lines") v = v.split("\n").map(s => s.trim()).filter(Boolean);
  else if (ty === "slug"){ S.autoSlug.delete(ctx.obj); }
  if (ty === "select" && /^\d+$/.test(v) && k === "homeSlot") v = Number(v);
  setP(ctx.obj, k, v);
  /* tự sinh slug từ tiêu đề khi tạo mới */
  if ((k === "name" || k === "title") && S.autoSlug.has(ctx.obj)){
    const s = uniqueSlug(ctx.file, slugify(v), ctx.obj);
    const el = $('[data-k="slug"]'); if (el) el.value = s;
    slugChanged(s);
  }
  if (k === "name" || k === "title") $("#title").textContent = v || TITLES[S.view];
  const f = t.closest(".f"); if (f && f.classList.contains("bad")) { f.classList.remove("bad"); f.querySelector(".msg").textContent = ""; }
  markDirty(ctx.file);
});
view.addEventListener("change", e => {
  const t = e.target, ctx = S.ctx; if (!ctx) return;
  if (t.dataset.t === "slug"){
    const C = COLL[ctx.file];
    const s = uniqueSlug(ctx.file, slugify(t.value) || (C ? slugify(C.title(ctx.obj)) : "muc-moi"), ctx.obj);
    t.value = s; slugChanged(s);
  }
  if (t.dataset.k === "homeSlot" && ctx.file === "products"){
    const slot = Number(t.value);
    if (slot) S.data.products.forEach(p => { if (p !== ctx.obj && Number(p.homeSlot) === slot){ p.homeSlot = 0; toast(`Đã bỏ vị trí ${slot} khỏi "${p.name}"`); } });
  }
  if (t.dataset.k === "featured" && t.checked && ctx.file === "posts"){
    S.data.posts.forEach(p => { if (p !== ctx.obj && p.featured){ p.featured = false; toast(`"${p.title}" không còn là bài nổi bật`); } });
  }
});
view.addEventListener("click", async e => {
  const t = e.target, ctx = S.ctx;
  const cmd = t.closest("[data-cmd]"); if (cmd){ e.preventDefault(); rteCmd(cmd); return; }
  if (!ctx) return;
  const pa = t.closest("[data-pair-add]");
  if (pa){ const k = pa.dataset.pairAdd; const arr = getP(ctx.obj, k) || []; arr.push(["", ""]); setP(ctx.obj, k, arr); rerenderField(k); markDirty(ctx.file); const rows = $$(`[data-field="${CSS.escape(k)}"] .pair`); const last = rows[rows.length - 1]; if (last) last.querySelector("input").focus(); return; }
  const pr = t.closest("[data-pair-rm]");
  if (pr){ const k = pr.closest(".pairs").dataset.k; const arr = getP(ctx.obj, k) || []; arr.splice(Number(pr.dataset.pairRm), 1); rerenderField(k); markDirty(ctx.file); return; }
  const up = t.closest("[data-img-up]");
  if (up){ const [p] = await uploadFlow(up.dataset.folder, false); if (p){ setP(ctx.obj, up.dataset.imgUp, p); rerenderField(up.dataset.imgUp); markDirty(ctx.file); } return; }
  const lib = t.closest("[data-img-lib]");
  if (lib){ const p = await pickFromLibrary(); if (p){ setP(ctx.obj, lib.dataset.imgLib, p); rerenderField(lib.dataset.imgLib); markDirty(ctx.file); } return; }
  const cl = t.closest("[data-img-clear]");
  if (cl){ setP(ctx.obj, cl.dataset.imgClear, ""); rerenderField(cl.dataset.imgClear); markDirty(ctx.file); return; }
  const gu = t.closest("[data-gal-up]");
  if (gu){ const ps = await uploadFlow(gu.dataset.folder, true); if (ps.length){ const k = gu.dataset.galUp; setP(ctx.obj, k, [...(getP(ctx.obj, k) || []), ...ps]); rerenderField(k); markDirty(ctx.file); } return; }
  const gl = t.closest("[data-gal-lib]");
  if (gl){
    const p = await pickFromLibrary(); if (!p) return;
    const k = gl.dataset.galLib, arr = getP(ctx.obj, k) || [];
    if (arr.includes(p)) { toast("Ảnh này đã có trong bộ ảnh"); return; }
    setP(ctx.obj, k, [...arr, p]); rerenderField(k); markDirty(ctx.file); return;
  }
  const gr = t.closest("[data-gal-rm]");
  if (gr){ const [k, i] = gr.dataset.galRm.split("|"); const arr = getP(ctx.obj, k); arr.splice(Number(i), 1); rerenderField(k); markDirty(ctx.file); return; }
  const gm = t.closest("[data-gal-mv]");
  if (gm){ const [k, i, d] = gm.dataset.galMv.split("|"); const arr = getP(ctx.obj, k), a = Number(i), b = a + Number(d); if (b < 0 || b >= arr.length) return; [arr[a], arr[b]] = [arr[b], arr[a]]; rerenderField(k); markDirty(ctx.file); return; }
});
view.addEventListener("mousedown", e => { if (e.target.closest(".rte-bar")) e.preventDefault(); });
view.addEventListener("focusout", e => { if (e.target.classList && e.target.classList.contains("rte-ed")) saveSel(); });
view.addEventListener("keyup", e => { if (e.target.classList && e.target.classList.contains("rte-ed")) saveSel(); });
view.addEventListener("mouseup", e => { if (e.target.closest && e.target.closest(".rte-ed")) saveSel(); });

/* =====================================================================
   ĐỊNH NGHĨA FORM
   ===================================================================== */
const SETTINGS_SECTIONS = [
  { h: "Thương hiệu & liên hệ", d: "Hiển thị ở logo, chân trang, nút gọi và nút Zalo trên toàn website.", f: [
    { k: "brand", t: "text", l: "Tên thương hiệu (logo)", req: 1 },
    { k: "brandTagline", t: "text", l: "Dòng chữ nhỏ dưới logo" },
    { k: "shopName", t: "text", l: "Tên cửa hàng / công ty", req: 1, full: 1 },
    { k: "phone", t: "tel", l: "Hotline", req: 1, ph: "0912 345 678" },
    { k: "zalo", t: "tel", l: "Số Zalo", req: 1, ph: "0912345678" },
    { k: "email", t: "email", l: "Email" },
    { k: "address", t: "text", l: "Địa chỉ" } ] },
  { h: "Bán hàng & giao hàng", f: [
    { k: "priceNote", t: "text", l: "Ghi chú dưới giá", full: 1 },
    { k: "shippingFee", t: "money", l: "Phí giao hàng", nullable: 1, nullLabel: "Để trống = “Báo khi xác nhận đơn”" },
    { k: "freeShippingFrom", t: "money", l: "Miễn phí giao hàng từ", nullable: 1, nullLabel: "Để trống = không áp dụng" },
    { k: "perks", t: "lines", l: "Cam kết hiển thị ở cửa hàng", hint: "Chỉ ghi điều bạn thực sự áp dụng." },
    { k: "orderEndpoint", t: "url", l: "Link nhận đơn tự động (Google Apps Script)", full: 1, hint: "Để trống: khách gửi đơn qua Zalo. Hướng dẫn trong README." } ] },
  { h: "Chuyển khoản ngân hàng", d: "Điền đủ Mã ngân hàng và Số tài khoản để bật “Chuyển khoản” kèm mã QR. Để trống = chỉ nhận COD.", f: [
    { k: "bank.code", t: "text", l: "Mã ngân hàng (VietQR)", ph: "VCB, MB, TCB, ACB…" },
    { k: "bank.name", t: "text", l: "Tên ngân hàng hiển thị", ph: "Vietcombank" },
    { k: "bank.account", t: "text", l: "Số tài khoản" },
    { k: "bank.owner", t: "text", l: "Chủ tài khoản", ph: "NGUYEN VAN A" } ] },
  { h: "Tìm kiếm Google (SEO)", f: [
    { k: "seo.title", t: "text", l: "Tiêu đề trang chủ", full: 1 },
    { k: "seo.description", t: "textarea", l: "Mô tả ngắn", rows: 2 },
    { k: "postsPerPage", t: "number", l: "Số bài mỗi lần tải ở trang Tin tức" } ] }
];
const HOME_SECTIONS = [
  { h: "Phần mở đầu", d: "Khối chữ lớn đầu tiên trên trang chủ, cạnh cảnh 3D.", f: [
    { k: "home.heroEyebrow", t: "text", l: "Dòng chữ nhỏ phía trên", full: 1 },
    { k: "home.heroTitle", t: "emph", l: "Tiêu đề lớn", full: 1, req: 1 },
    { k: "home.heroLead", t: "textarea", l: "Đoạn giới thiệu" },
    { k: "home.heroMeta", t: "pairs", l: "Ba điểm nổi bật", ph1: "Chữ lớn", ph2: "Chữ nhỏ" } ] },
  { h: "Dải chữ chạy", f: [ { k: "home.marquee", t: "lines", l: "Các cụm từ" } ] },
  { h: "Phần liên hệ cuối trang", f: [
    { k: "home.contactEyebrow", t: "text", l: "Dòng chữ nhỏ", full: 1 },
    { k: "home.contactTitle", t: "emph", l: "Tiêu đề", full: 1 },
    { k: "home.contactLead", t: "textarea", l: "Đoạn mô tả" } ] },
  { h: "Hai sản phẩm trên trang chủ", d: `Chọn trong <a href="#products">Sản phẩm</a> → mục “Hiển thị ở trang chủ” (Vị trí 1 và Vị trí 2).`, f: [] }
];
const PRODUCT_SECTIONS = [
  { h: "Thông tin chính", f: [
    { k: "name", t: "text", l: "Tên sản phẩm", req: 1, full: 1 },
    { k: "slug", t: "slug", l: "Đường dẫn", req: 1, hint: "chỉ chữ thường không dấu, số, gạch nối" },
    { k: "tag", t: "text", l: "Nhãn ngắn", ph: "Dòng sắc đẹp" },
    { k: "short", t: "text", l: "Mô tả một dòng", full: 1 },
    { k: "price", t: "money", l: "Giá bán (đồng)", req: 1 },
    { k: "compareAt", t: "money", l: "Giá gốc (gạch ngang)", nullable: 1, nullLabel: "Để trống nếu không giảm giá" },
    { k: "visible", t: "toggle", l: "Hiển thị trên website" },
    { k: "theme", t: "select", l: "Màu nền hình minh họa", opts: [["pearl", "Ngọc trai (sáng)"], ["rose", "Hồng"], ["duo", "Bộ đôi"]] } ] },
  { h: "Hình ảnh", d: "Ảnh tự được nén (tối đa 1600px). Nếu không có ảnh, website dùng hình minh họa chai.", f: [
    { k: "image", t: "image", l: "Ảnh chính", folder: "products", empty: "Dùng hình minh họa" },
    { k: "gallery", t: "gallery", l: "Ảnh phụ (trang chi tiết)", folder: "products" } ] },
  { h: "Nội dung chi tiết", f: [
    { k: "desc", t: "textarea", l: "Mô tả" },
    { k: "highlights", t: "lines", l: "Điểm nổi bật" },
    { k: "specs", t: "pairs", l: "Thành phần & thông số", ph1: "Tên", ph2: "Giá trị" },
    { k: "usage", t: "lines", l: "Cách dùng" } ] },
  { h: "Hiển thị ở trang chủ", d: "Trang chủ có 2 vị trí giới thiệu sản phẩm (cạnh cảnh 3D). Chọn vị trí cho sản phẩm này.", f: [
    { k: "homeSlot", t: "select", l: "Vị trí", opts: [["0", "Không hiển thị ở trang chủ"], ["1", "Vị trí 1 (nền sáng)"], ["2", "Vị trí 2 (nền hồng)"]] },
    { k: "homeTag", t: "text", l: "Nhãn nhỏ", ph: "Sản phẩm 01 · …" },
    { k: "homeTitle", t: "emph", l: "Tiêu đề", full: 1, ph: "PURE NMN *12000MG+*" },
    { k: "homeLead", t: "textarea", l: "Đoạn giới thiệu", rows: 2 },
    { k: "homeSpecs", t: "pairs", l: "Thông số hiển thị", hint: "để trống = dùng “Thành phần & thông số”", ph1: "Tên", ph2: "Giá trị" },
    { k: "forWho", t: "textarea", l: "Phù hợp với ai", rows: 2 } ] }
];
const POST_SECTIONS = [
  { h: "Thông tin bài viết", f: [
    { k: "title", t: "text", l: "Tiêu đề", req: 1, full: 1 },
    { k: "slug", t: "slug", l: "Đường dẫn", req: 1, hint: "chữ thường không dấu" },
    { k: "type", t: "select", l: "Chuyên mục", opts: [["kien-thuc", "Kiến thức"], ["nghien-cuu", "Nghiên cứu"], ["tin-tuc", "Tin tức"]] },
    { k: "date", t: "date", l: "Ngày đăng", req: 1 },
    { k: "read", t: "number", l: "Số phút đọc", hint: "tự tính theo độ dài" },
    { k: "published", t: "toggle", l: "Đăng lên website" },
    { k: "featured", t: "toggle", l: "Bài nổi bật", hint: "chỉ 1 bài" },
    { k: "sample", t: "toggle", l: "Gắn nhãn “Mẫu”", hint: "tắt khi đã là nội dung thật" },
    { k: "image", t: "image", l: "Ảnh bìa", folder: "posts", empty: "Dùng hình minh họa" },
    { k: "excerpt", t: "textarea", l: "Tóm tắt", rows: 3 } ] },
  { h: "Nội dung", f: [ { k: "body", t: "rich", l: "Bài viết" } ] }
];
const EVENT_SECTIONS = [
  { h: "Thông tin sự kiện", f: [
    { k: "title", t: "text", l: "Tên sự kiện", req: 1, full: 1 },
    { k: "slug", t: "slug", l: "Đường dẫn", req: 1 },
    { k: "date", t: "date", l: "Ngày diễn ra", req: 1 },
    { k: "time", t: "text", l: "Giờ", ph: "09:00 – 11:30" },
    { k: "place", t: "text", l: "Địa điểm" },
    { k: "city", t: "text", l: "Tỉnh / thành phố" },
    { k: "seats", t: "text", l: "Số chỗ", ph: "50 chỗ" },
    { k: "registerUrl", t: "url", l: "Link đăng ký", hint: "để trống = mở Zalo" },
    { k: "published", t: "toggle", l: "Đăng lên website" },
    { k: "sample", t: "toggle", l: "Gắn nhãn “Mẫu”" },
    { k: "image", t: "image", l: "Ảnh bìa", folder: "events", empty: "Dùng hình minh họa" } ] },
  { h: "Mô tả chi tiết", f: [ { k: "desc", t: "rich", l: "Nội dung" } ] }
];

/* ---------- collections ---------- */
const TYPE_LABEL = { "kien-thuc": "Kiến thức", "nghien-cuu": "Nghiên cứu", "tin-tuc": "Tin tức" };
const COLL = {
  products: {
    one: "sản phẩm", sections: PRODUCT_SECTIONS, sortable: true,
    list: () => S.data.products,
    find: i => S.data.products.find(p => p.slug === i),
    title: p => p.name,
    img: p => p.image || (p.gallery || [])[0],
    meta: p => [fmt(p.price), p.short, p.homeSlot ? `<span class="badge gold">Trang chủ · vị trí ${p.homeSlot}</span>` : "", p.visible === false ? '<span class="badge off">Đang ẩn</span>' : '<span class="badge on">Hiển thị</span>'],
    make: () => ({ slug: "", visible: false, name: "Sản phẩm mới", tag: "", short: "", price: 0, compareAt: null, theme: "pearl", image: "", gallery: [], desc: "", highlights: [], specs: [["Xuất xứ", "Nhật Bản"]], usage: [], homeSlot: 0, homeTag: "", homeTitle: "", homeLead: "", forWho: "", homeSpecs: [] }),
    preview: p => "#san-pham/" + p.slug
  },
  posts: {
    one: "bài viết", sections: POST_SECTIONS,
    list: () => S.data.posts.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))),
    find: i => S.data.posts.find(p => p.slug === i),
    title: p => p.title,
    img: p => p.image,
    meta: p => [p.date, TYPE_LABEL[p.type] || p.type, p.featured ? '<span class="badge gold">Nổi bật</span>' : "", p.sample ? '<span class="badge warn">Mẫu</span>' : "", p.published === false ? '<span class="badge off">Bản nháp</span>' : '<span class="badge on">Đã đăng</span>'],
    make: () => ({ slug: "", published: false, type: "kien-thuc", featured: false, sample: false, title: "Bài viết mới", date: today(), read: 1, image: "", excerpt: "", body: "<p></p>" }),
    preview: p => "#bai/" + p.slug
  },
  events: {
    one: "sự kiện", sections: EVENT_SECTIONS,
    list: () => S.data.events.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))),
    find: i => S.data.events.find(p => p.slug === i),
    title: p => p.title,
    img: p => p.image,
    meta: p => [p.date + (p.time ? " · " + p.time : ""), [p.place, p.city].filter(Boolean).join(" · "), p.sample ? '<span class="badge warn">Mẫu</span>' : "", p.published === false ? '<span class="badge off">Bản nháp</span>' : '<span class="badge on">Đã đăng</span>'],
    make: () => ({ slug: "", published: false, sample: false, title: "Sự kiện mới", date: today(), time: "", place: "", city: "", seats: "", image: "", registerUrl: "", desc: "<p></p>" }),
    preview: p => "#su-kien/" + p.slug
  }
};
function uniqueSlug(file, base, self){
  base = base || "muc-moi"; let s = base, i = 2;
  while (S.data[file].some(x => x !== self && x.slug === s)) s = `${base}-${i++}`;
  return s;
}

/* =====================================================================
   VIEWS
   ===================================================================== */
function viewOverview(){
  S.ctx = null;
  const n = changeCount(), ch = [];
  S.dirty.forEach(f => ch.push(`Đã sửa: ${FILE_LABEL[f]}`));
  if (S.uploads.size) ch.push(`${S.uploads.size} ảnh mới chờ tải lên`);
  if (S.deletes.size) ch.push(`${S.deletes.size} ảnh sẽ bị xoá`);
  const lc = S.lastCommit || {};
  view.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${S.data.products.length}</b><span>Sản phẩm (${S.data.products.filter(p => p.visible !== false).length} đang hiển thị)</span></div>
      <div class="stat"><b>${S.data.posts.length}</b><span>Bài viết (${S.data.posts.filter(p => p.published !== false).length} đã đăng)</span></div>
      <div class="stat"><b>${S.data.events.length}</b><span>Sự kiện</span></div>
      <div class="stat"><b>${S.images.length - S.deletes.size + S.uploads.size}</b><span>Ảnh trong thư viện</span></div>
    </div>
    <section class="card"><h2>Thay đổi chưa xuất bản</h2>
      ${n ? `<ul class="changes">${ch.map(c => `<li>${esc(c)}</li>`).join("")}</ul>
        <p class="muted small" style="margin-top:12px">Bấm <b>Xem trước</b> để kiểm tra trên website, rồi <b>Xuất bản</b> để cập nhật cho khách.</p>
        <div style="margin-top:12px"><button class="btn btn-danger btn-sm" id="discard">Huỷ mọi thay đổi</button></div>`
        : `<p class="muted">Không có thay đổi nào. Website đang hiển thị đúng nội dung trong repo.</p>`}
    </section>
    <section class="card"><h2>Bắt đầu nhanh</h2>
      <ul class="tips">
        <li><a href="#settings">Cài đặt chung</a> — hotline, Zalo, tên cửa hàng, phí giao hàng, tài khoản ngân hàng.</li>
        <li><a href="#home">Trang chủ</a> — tiêu đề, đoạn giới thiệu, dải chữ chạy, phần liên hệ.</li>
        <li><a href="#products">Sản phẩm</a> — giá, ảnh, mô tả, sản phẩm hiển thị ở trang chủ.</li>
        <li><a href="#posts">Bài viết</a> & <a href="#events">Sự kiện</a> — soạn bài có ảnh, lên lịch sự kiện.</li>
        <li><a href="#media">Thư viện ảnh</a> — tải lên, xem, xoá ảnh.</li>
      </ul>
    </section>
    <section class="card"><h2>Thông tin</h2>
      <p class="muted small">Repo <b>${esc(S.cfg.owner)}/${esc(S.cfg.repo)}</b> · nhánh <b>${esc(S.cfg.branch)}</b><br>
      Cập nhật gần nhất: ${lc.date ? esc(new Date(lc.date).toLocaleString("vi-VN")) : "—"} — “${esc((lc.msg || "").split("\n")[0])}”<br>
      <a href="https://github.com/${esc(S.cfg.owner)}/${esc(S.cfg.repo)}/commits/${esc(S.cfg.branch)}" target="_blank" rel="noopener">Lịch sử thay đổi trên GitHub ↗</a> · <a href="${esc(SITE_BASE)}" target="_blank" rel="noopener">Mở website ↗</a></p>
    </section>`;
  const d = $("#discard");
  if (d) d.addEventListener("click", async () => {
    if (!(await confirmModal("Huỷ mọi thay đổi?", "Nội dung sẽ được tải lại từ GitHub. Mọi chỉnh sửa và ảnh mới chưa xuất bản sẽ mất.", "Huỷ thay đổi", true))) return;
    busy(true, "Đang tải lại…"); try { await loadAll(); render(); toast("Đã tải lại nội dung từ GitHub"); } catch (e){ toast(apiError(e), true); } finally { busy(false); }
  });
}
function viewForm(file, obj, sections){
  bindCtx(file, obj, sections);
  view.innerHTML = sectionsHtml(sections, obj);
}
function viewList(name){
  S.ctx = null;
  const C = COLL[name], items = C.list();
  view.innerHTML = `
    <div class="lhead">
      <input class="search" id="lsearch" type="search" placeholder="Tìm ${C.one}…" aria-label="Tìm">
      <button class="btn btn-ink" id="add-item">+ Thêm ${C.one}</button>
    </div>
    <div class="items" id="items">${items.length ? items.map(it => `
      <div class="item" data-edit="${esc(it.slug)}" data-q="${esc(slugify(C.title(it)))}">
        ${thumbHtml(C.img(it), "—")}
        <div style="min-width:0"><h3>${esc(C.title(it))}</h3><div class="meta">${C.meta(it).filter(Boolean).map(m => /^</.test(m) ? m : `<span>${esc(m)}</span>`).join("")}</div></div>
        <div class="acts">
          ${C.sortable ? `<button data-mv="${esc(it.slug)}|-1" title="Lên" aria-label="Chuyển lên">↑</button><button data-mv="${esc(it.slug)}|1" title="Xuống" aria-label="Chuyển xuống">↓</button>` : ""}
          <button data-dup="${esc(it.slug)}" title="Nhân bản" aria-label="Nhân bản">⧉</button>
          <button data-del="${esc(it.slug)}" title="Xoá" aria-label="Xoá">🗑</button>
        </div>
      </div>`).join("") : `<div class="empty">Chưa có ${C.one} nào.</div>`}</div>`;
  $("#lsearch").addEventListener("input", e => { const q = slugify(e.target.value); $$("#items .item").forEach(el => el.hidden = q && !el.dataset.q.includes(q)); });
  $("#add-item").addEventListener("click", () => {
    const it = C.make(); it.slug = uniqueSlug(name, slugify(C.title(it)), it);
    S.data[name].unshift(it); S.autoSlug.add(it); markDirty(name);
    location.hash = `${name}/${it.slug}`;
  });
  $("#items").addEventListener("click", async e => {
    const mv = e.target.closest("[data-mv]"), dup = e.target.closest("[data-dup]"), del = e.target.closest("[data-del]"), ed = e.target.closest("[data-edit]");
    const arr = S.data[name];
    if (mv){ const [slug, d] = mv.dataset.mv.split("|"); const i = arr.findIndex(x => x.slug === slug), j = i + Number(d); if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; markDirty(name); viewList(name); return; }
    if (dup){ const src = C.find(dup.dataset.dup), c = clone(src); const tk = name === "products" ? "name" : "title"; c[tk] += " (bản sao)"; c.slug = uniqueSlug(name, src.slug + "-ban-sao", c); if (name === "products"){ c.visible = false; c.homeSlot = 0; } else { c.published = false; c.featured = false; } arr.splice(arr.indexOf(src) + 1, 0, c); markDirty(name); toast(`Đã nhân bản — bản sao đang ẩn`); viewList(name); return; }
    if (del){ const it = C.find(del.dataset.del); if (!(await confirmModal(`Xoá ${C.one}?`, `“${esc(C.title(it))}” sẽ bị xoá khỏi website sau khi Xuất bản.`, "Xoá", true))) return; arr.splice(arr.indexOf(it), 1); markDirty(name); viewList(name); return; }
    if (ed) location.hash = `${name}/${ed.dataset.edit}`;
  });
}
function viewEdit(name, item){
  const C = COLL[name];
  bindCtx(name, item, C.sections);
  view.innerHTML = `
    <div class="edit-head">
      <a class="btn btn-line btn-sm" href="#${name}">← Danh sách ${C.one}</a>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-line btn-sm" id="pv-item">Xem trước ${C.one} này</button>
        <button class="btn btn-danger btn-sm" id="del-item">Xoá</button>
      </div>
    </div>` + sectionsHtml(C.sections, item);
  $("#del-item").addEventListener("click", async () => {
    if (!(await confirmModal(`Xoá ${C.one}?`, `“${esc(C.title(item))}” sẽ bị xoá khỏi website sau khi Xuất bản.`, "Xoá", true))) return;
    S.data[name].splice(S.data[name].indexOf(item), 1); markDirty(name); location.hash = name;
  });
  $("#pv-item").addEventListener("click", () => preview(C.preview(item)));
}
function viewMedia(){
  S.ctx = null;
  const imgs = allImages();
  view.innerHTML = `
    <div class="lhead">
      <div class="muted small">Ảnh tự được nén về tối đa ${MAX_IMG}px (định dạng WebP). Ảnh mới sẽ tải lên GitHub khi bấm Xuất bản.</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select id="up-folder" class="search" style="max-width:180px;min-width:0"><option value="misc">Thư mục: chung</option><option value="products">Sản phẩm</option><option value="posts">Bài viết</option><option value="events">Sự kiện</option></select>
        <button class="btn btn-ink" id="up-many">+ Tải ảnh lên</button>
      </div>
    </div>
    ${imgs.length ? `<div class="media">${imgs.map(m => { const u = usage(m.path); return `
      <div class="mi">${thumbHtml(m.path)}
        <div class="mm"><div class="nm">${esc(m.path.replace(/^images\//, ""))}</div>
          <div class="row"><span>${kb(m.size)}${m.pending ? " · <b style='color:var(--rose)'>chờ xuất bản</b>" : ""}</span><span>${u ? `dùng ${u} nơi` : "chưa dùng"}</span></div>
          <div class="row"><button class="link" data-copy="${esc(m.path)}">Sao chép đường dẫn</button><button class="link" data-rmimg="${esc(m.path)}" style="color:var(--rose)">Xoá</button></div>
        </div></div>`; }).join("")}</div>` : `<div class="empty card">Thư viện chưa có ảnh nào.</div>`}`;
  $("#up-many").addEventListener("click", async () => { const ps = await uploadFlow($("#up-folder").value, true); if (ps.length) viewMedia(); });
  view.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("Đã sao chép: " + b.dataset.copy); } catch (_) { toast(b.dataset.copy); } }));
  view.querySelectorAll("[data-rmimg]").forEach(b => b.addEventListener("click", async () => {
    const p = b.dataset.rmimg, u = usage(p);
    if (!(await confirmModal("Xoá ảnh?", `${esc(p)}${u ? `<br><b style="color:var(--rose)">Ảnh đang được dùng ở ${u} nơi</b> — những chỗ đó sẽ mất ảnh.` : ""}`, "Xoá ảnh", true))) return;
    if (S.uploads.has(p)) S.uploads.delete(p); else S.deletes.add(p);
    paintDirty(); viewMedia();
  }));
}

/* =====================================================================
   KIỂM TRA DỮ LIỆU
   ===================================================================== */
function validate(){
  const issues = [], warns = [];
  const s = S.data.site;
  if (!s.brand) issues.push(["settings", "Cài đặt: chưa có tên thương hiệu"]);
  if (!s.phone) issues.push(["settings", "Cài đặt: chưa có hotline"]);
  const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  ["products", "posts", "events"].forEach(f => {
    const seen = new Set();
    S.data[f].forEach(it => {
      const name = COLL[f].title(it) || "(chưa đặt tên)";
      if (!COLL[f].title(it)) issues.push([`${f}/${it.slug}`, `${FILE_LABEL[f]}: có mục chưa có tên/tiêu đề`]);
      if (!slugRe.test(it.slug || "")) issues.push([`${f}/${it.slug}`, `${FILE_LABEL[f]} “${name}”: đường dẫn không hợp lệ`]);
      else if (seen.has(it.slug)) issues.push([`${f}/${it.slug}`, `${FILE_LABEL[f]}: đường dẫn “${it.slug}” bị trùng`]);
      seen.add(it.slug);
      if (f !== "products" && !/^\d{4}-\d{2}-\d{2}$/.test(it.date || "")) issues.push([`${f}/${it.slug}`, `${FILE_LABEL[f]} “${name}”: ngày chưa hợp lệ`]);
      if (f === "products" && !(Number(it.price) >= 0)) issues.push([`${f}/${it.slug}`, `Sản phẩm “${name}”: giá chưa hợp lệ`]);
    });
  });
  [1, 2].forEach(slot => { if (!S.data.products.some(p => Number(p.homeSlot) === slot && p.visible !== false)) warns.push(`Trang chủ: chưa có sản phẩm (đang hiển thị) ở vị trí ${slot}`); });
  return { issues, warns };
}

/* =====================================================================
   XEM TRƯỚC
   ===================================================================== */
function preview(hash = ""){
  const images = {}; S.uploads.forEach((u, p) => images[p] = u.dataUrl); S.shown.forEach((u, p) => { if (!images[p]) images[p] = u; });
  const draft = { site: S.data.site, products: S.data.products, posts: S.data.posts, events: S.data.events, images };
  let ok = store.set("nmn_cms_draft", JSON.stringify(draft));
  if (!ok){ ok = store.set("nmn_cms_draft", JSON.stringify({ ...draft, images: {} })); if (ok) toast("Ảnh mới quá lớn để xem trước — chữ vẫn hiển thị đúng", true); }
  if (!ok) { toast("Trình duyệt không cho lưu bản xem trước.", true); return; }
  window.open(SITE_BASE + "?preview=1" + (hash || ""), "nmn-preview");
}
$("#preview-btn").addEventListener("click", () => {
  const v = S.view, ed = S.editing != null && COLL[v] ? COLL[v].find(S.editing) : null;
  preview(ed ? COLL[v].preview(ed) : v === "products" ? "#cua-hang" : v === "posts" || v === "events" ? "#tin-tuc" : "");
});

/* =====================================================================
   XUẤT BẢN — 1 commit cho mọi thay đổi
   ===================================================================== */
$("#publish-btn").addEventListener("click", publish);
async function publish(){
  if (!changeCount()) return;
  const { issues, warns } = validate();
  if (issues.length){
    await alertModal("Cần sửa trước khi xuất bản", `<ul class="tips">${issues.map(([h, m]) => `<li><a href="#${esc(h)}" data-mv="1">${esc(m)}</a></li>`).join("")}</ul>`);
    return;
  }
  const parts = [...S.dirty].map(f => FILE_LABEL[f]);
  if (S.uploads.size) parts.push(`${S.uploads.size} ảnh mới`);
  if (S.deletes.size) parts.push(`xoá ${S.deletes.size} ảnh`);
  const ok = await confirmModal("Xuất bản thay đổi?", `Sẽ cập nhật: <b>${esc(parts.join(", "))}</b>.${warns.length ? `<br><br><span style="color:var(--rose)">${warns.map(esc).join("<br>")}</span>` : ""}<br><br>Website sẽ hiển thị nội dung mới sau khoảng 1 phút.`, "Xuất bản");
  if (!ok) return;
  busy(true, "Đang kiểm tra repo…");
  try {
    const ref = await gh(repoPath(`/git/ref/heads/${encodeURIComponent(S.cfg.branch)}`));
    const head = ref.object.sha;
    const commit = await gh(repoPath(`/git/commits/${head}`));
    if (head !== S.head){
      const tree = await gh(repoPath(`/git/trees/${commit.tree.sha}?recursive=1`));
      const changed = [...S.dirty].filter(f => { const e = tree.tree.find(t => t.path === `content/${f}.json`); return (e ? e.sha : null) !== S.shas[f]; });
      if (changed.length){
        busy(false);
        const go = await confirmModal("Nội dung vừa được sửa ở nơi khác", `Phần <b>${esc(changed.map(f => FILE_LABEL[f]).join(", "))}</b> đã thay đổi trên GitHub sau khi bạn mở trang quản trị. Xuất bản sẽ <b>ghi đè</b> thay đổi đó.`, "Vẫn ghi đè", true);
        if (!go) return;
        busy(true);
      }
    }
    const entries = [], newShas = {};
    let step = 0; const total = S.dirty.size + S.uploads.size;
    for (const f of S.dirty){
      busy(true, `Đang lưu nội dung (${++step}/${total})…`);
      const b = await gh(repoPath("/git/blobs"), { method: "POST", body: { content: JSON.stringify(S.data[f], null, 2) + "\n", encoding: "utf-8" } });
      entries.push({ path: `content/${f}.json`, mode: "100644", type: "blob", sha: b.sha }); newShas[f] = b.sha;
    }
    for (const [p, u] of S.uploads){
      busy(true, `Đang tải ảnh (${++step}/${total})…`);
      const b = await gh(repoPath("/git/blobs"), { method: "POST", body: { content: u.b64, encoding: "base64" } });
      entries.push({ path: p, mode: "100644", type: "blob", sha: b.sha });
    }
    S.deletes.forEach(p => entries.push({ path: p, mode: "100644", type: "blob", sha: null }));
    busy(true, "Đang tạo phiên bản mới…");
    const tree = await gh(repoPath("/git/trees"), { method: "POST", body: { base_tree: commit.tree.sha, tree: entries } });
    const nc = await gh(repoPath("/git/commits"), { method: "POST", body: { message: `CMS: cập nhật ${parts.join(", ")}`, tree: tree.sha, parents: [head] } });
    await gh(repoPath(`/git/refs/heads/${encodeURIComponent(S.cfg.branch)}`), { method: "PATCH", body: { sha: nc.sha } });
    /* cập nhật trạng thái cục bộ */
    S.head = nc.sha; S.lastCommit = { sha: nc.sha, date: new Date().toISOString(), msg: `CMS: cập nhật ${parts.join(", ")}` };
    Object.assign(S.shas, newShas);
    S.uploads.forEach((u, p) => { S.shown.set(p, u.dataUrl); S.images.push({ path: p, size: u.size }); });
    S.images = S.images.filter(x => !S.deletes.has(x.path));
    S.dirty.clear(); S.uploads.clear(); S.deletes.clear();
    store.del("nmn_cms_draft");
    busy(false); render();
    alertModal("Đã xuất bản 🎉", `Thay đổi đã được lưu vào GitHub. Website sẽ cập nhật sau khoảng <b>1 phút</b>.<br><br><a href="${esc(SITE_BASE)}" target="_blank" rel="noopener">Mở website ↗</a>`);
  } catch (e){
    busy(false);
    toast(apiError(e), true);
  }
}

/* =====================================================================
   KHỞI ĐỘNG
   ===================================================================== */
readCfg();
const saved = store.get("nmn_cms_token") || store.get("nmn_cms_token", sessionStorage);
if (saved) login(saved, !!store.get("nmn_cms_token")).then(ok => { if (!ok) store.del("nmn_cms_token"); });
})();
