/* =====================================================================
   NMN website · app.js
   Nội dung (cài đặt, trang chủ, sản phẩm, bài viết, sự kiện) nằm trong
   thư mục content/ và được sửa qua trang quản trị /admin.
   File này chỉ chứa chức năng — không cần sửa khi đổi nội dung.
   ===================================================================== */
window.NMN = (function(){
  const FILES = ["site", "products", "posts", "events"];
  const preview = new URLSearchParams(location.search).has("preview");
  let draftImages = {};
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  /* "*chữ*" trong tiêu đề → chữ nghiêng màu vàng */
  const emph = s => esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");
  const fmt = n => new Intl.NumberFormat("vi-VN").format(Math.round(n || 0)) + "đ";
  const img = p => (p && draftImages[p]) || p || "";
  const imgHtml = html => String(html || "").replace(/(src=")(images\/[^"]+)"/g, (m, a, p) => a + esc(img(p)) + '"');

  async function getJSON(name){
    const r = await fetch(`content/${name}.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`content/${name}.json → ${r.status}`);
    return r.json();
  }
  async function load(){
    let data = null;
    if (preview){
      try { const d = JSON.parse(localStorage.getItem("nmn_cms_draft") || "null"); if (d && d.site){ data = d; draftImages = d.images || {}; } } catch (_) {}
    }
    if (!data){
      try {
        const vals = await Promise.all(FILES.map(getJSON));
        data = Object.fromEntries(FILES.map((f, i) => [f, vals[i]]));
      } catch (e){ fail(e); return false; }
    }
    window.CONFIG = data.site;
    window.ALL_PRODUCTS = data.products || [];
    window.PRODUCTS = window.ALL_PRODUCTS.filter(p => p.visible !== false);
    window.POSTS = (data.posts || []).filter(p => p.published !== false);
    window.EVENTS = (data.events || []).filter(e => e.published !== false);
    if (preview) banner();
    return true;
  }
  function fail(e){
    console.error(e);
    const L = document.getElementById("loader"); if (L) L.classList.add("hide");
    const box = document.createElement("div");
    box.className = "load-fail";
    const local = location.protocol === "file:";
    box.innerHTML = `<b>Không tải được nội dung website</b><p>${local
      ? "Website đọc nội dung từ thư mục <code>content/</code>, nên cần mở qua địa chỉ web (GitHub Pages hoặc máy chủ cục bộ), không mở trực tiếp file."
      : "Vui lòng kiểm tra kết nối mạng rồi tải lại trang."}</p><button class="btn btn-ink" onclick="location.reload()">Tải lại</button>`;
    document.body.appendChild(box);
  }
  function banner(){
    const b = document.createElement("div");
    b.className = "preview-bar";
    b.innerHTML = `<span>Bản xem trước — chưa xuất bản</span><a href="${location.pathname}${location.hash}">Thoát</a>`;
    document.body.appendChild(b);
  }

  /* ---------- structured data (JSON-LD) for search engines ---------- */
  function ld(obj){
    let el = document.getElementById("ld-json");
    if (!el){ el = document.createElement("script"); el.type = "application/ld+json"; el.id = "ld-json"; document.head.appendChild(el); }
    const C = window.CONFIG || {};
    el.textContent = JSON.stringify(obj || {
      "@context": "https://schema.org", "@type": "Organization",
      name: C.shopName || C.brand, url: location.origin + location.pathname,
      telephone: C.phone || undefined, email: C.email || undefined
    });
  }
  const abs = p => p ? new URL(img(p), location.href).href : undefined;

  /* ---------- fill the home page from content/site.json + products.json ---------- */
  function applyHome(){
    const C = window.CONFIG, H = C.home || {};
    const $ = s => document.querySelector(s);
    document.title = (C.seo && C.seo.title) || C.brand;
    const md = document.querySelector('meta[name="description"]'); if (md && C.seo && C.seo.description) md.content = C.seo.description;
    const set = (sel, html) => { const el = $(sel); if (el && html != null) el.innerHTML = html; };
    set("#hero .eyebrow", esc(H.heroEyebrow));
    set("#hero h1", emph(H.heroTitle));
    set("#hero p.lead", esc(H.heroLead));
    set("#hero .hero-meta", (H.heroMeta || []).map(([b, s]) => `<div><b>${esc(b)}</b><small>${esc(s)}</small></div>`).join(""));
    const mq = (H.marquee || []).map(t => `<span>${esc(t)}</span>`).join("");
    set(".marquee-track", mq + mq);
    set("#contact .eyebrow", esc(H.contactEyebrow));
    set("#contact h2", emph(H.contactTitle));
    set("#contact p.lead", esc(H.contactLead));
    [1, 2].forEach(slot => {
      const el = document.querySelector(`[data-home-slot="${slot}"]`); if (!el) return;
      const p = window.PRODUCTS.find(x => Number(x.homeSlot) === slot && !x.unlisted);
      if (!p){ el.innerHTML = `<p class="lead">Chưa chọn sản phẩm cho vị trí này (vào /admin → Sản phẩm → "Hiển thị ở trang chủ").</p>`; return; }
      const specs = (p.homeSpecs && p.homeSpecs.length ? p.homeSpecs : p.specs || []).slice(0, 6);
      el.innerHTML = `
        <div class="ptag reveal"><i></i>${esc(p.homeTag || p.tag)}</div>
        <h2 class="split">${emph(p.homeTitle || p.name)}</h2>
        <p class="lead reveal d2">${esc(p.homeLead || p.desc)}</p>
        <ul class="specs reveal d2">${specs.map(([k, v]) => `<li><span>${esc(k)}</span><span>${esc(v)}</span></li>`).join("")}</ul>
        <div class="buy reveal d3">
          <div class="price"><strong>${fmt(p.price)}</strong><small>${esc(C.priceNote)}</small></div>
          <div class="buy-btns">
            <button class="btn btn-ink" data-add="${esc(p.slug)}">Thêm vào giỏ</button>
            <a class="btn btn-line" href="#san-pham/${esc(p.slug)}">Chi tiết</a>
          </div>
        </div>
        ${p.forWho ? `<div class="for reveal d3">${esc(p.forWho)}</div>` : ""}
        <p class="disc-line reveal d3">Thực phẩm này không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.</p>`;
    });
  }

  return { load, applyHome, esc, emph, fmt, img, imgHtml, ld, abs, preview };
})();

/* ---------- 3D choreography: [x, y, z, scale] per home section ---------- */
window.SCENE3D = {
  KF: {
    desktop: [
      /*0 hero    */ { orb:[2.7,.2,-1.6,1.2],  helix:[6,0,-4,0],   A:[1.75,-.55,1.3,.6], B:[3.6,-.45,.9,.6] },
      /*1 nad     */ { orb:[3.1,0,-.4,1.1],    helix:[6,0,-4,0],   A:[7,-1,-2,0],        B:[8,-1,-2,0] },
      /*2 roles   */ { orb:[4.2,2,-5,.35],     helix:[3,0,0,.95],  A:[7,-1,-2,0],        B:[8,-1,-2,0] },
      /*3 pathway */ { orb:[-3.1,0,0,1.2],     helix:[-1,0,-6,0],  A:[-7,-1,-2,0],       B:[-8,-1,-2,0] },
      /*4 research*/ { orb:[0,.3,-8,1.7],      helix:[0,0,-8,0],   A:[-6,-1,-4,0],       B:[6,-1,-4,0] },
      /*5 pure    */ { orb:[4.6,2.2,-7,.6],    helix:[0,0,-8,0],   A:[2.7,-.1,1,1.25],   B:[8,0,-3,0] },
      /*6 regene  */ { orb:[-4.6,2.2,-7,.6],   helix:[0,0,-8,0],   A:[-8,0,-3,0],        B:[-2.7,-.1,1,1.25] },
      /*7 ritual  */ { orb:[0,0,-9,1.4],       helix:[0,0,-8,0],   A:[-5.4,-.3,-1,.8],   B:[5.4,-.3,-1,.8] },
      /*8 contact */ { orb:[0,2.6,-6,.7],      helix:[0,0,-8,0],   A:[-4.4,-.2,0,.62],   B:[4.4,-.2,0,.62] }
    ],
    /* stacked (portrait) layout: 3D lives in the top half, text below */
    stacked: [
      /*0*/ { orb:[0,2.55,-1.6,.9],   helix:[2,2,-4,0],    A:[-.8,1.65,1,.44],  B:[.8,1.7,.8,.44] },
      /*1*/ { orb:[0,2.6,-1,.85],     helix:[2,2,-4,0],    A:[3,2,-2,0],        B:[3,2,-2,0] },
      /*2*/ { orb:[1.6,4.2,-5,.22],   helix:[0,2.6,0,.58], A:[3,2,-2,0],        B:[3,2,-2,0] },
      /*3*/ { orb:[0,2.6,0,.8],       helix:[0,2,-6,0],    A:[-3,2,-2,0],       B:[3,2,-2,0] },
      /*4*/ { orb:[0,-3.4,-9,.9],     helix:[0,0,-8,0],    A:[-3,0,-4,0],       B:[3,0,-4,0] },
      /*5*/ { orb:[1.8,4.2,-7,.35],   helix:[0,0,-8,0],    A:[0,2.25,.6,.8],    B:[3,2,-3,0] },
      /*6*/ { orb:[-1.8,4.2,-7,.35],  helix:[0,0,-8,0],    A:[-3,2,-3,0],       B:[0,2.25,.6,.8] },
      /*7*/ { orb:[0,-3.6,-10,.7],    helix:[0,0,-8,0],    A:[-3,2,-3,0],       B:[3,2,-3,0] },
      /*8*/ { orb:[0,2.85,-3.5,.85],  helix:[0,0,-8,0],    A:[-.75,2.3,.8,.48], B:[.75,2.3,.8,.48] }
    ]
  },
  stacked(){ return innerWidth / innerHeight < 1.2; },
  fov(){ return this.stacked() ? 50 : 35; },
  sections(){ return [...document.querySelectorAll('#home > section[data-scene]')]; },
  /* continuous section index for the current scroll position */
  index(){
    const secs = this.sections(), H = innerHeight, st = this.stacked();
    // stacked: a section's "moment" is when its top reaches the top of the screen; desktop: when its centre is centred
    const keys = secs.map(s => st ? s.offsetTop + H * .5 : s.offsetTop + s.offsetHeight / 2);
    const mid = scrollY + H * .5;
    if (mid <= keys[0]) return 0;
    for (let i = 0; i < keys.length - 1; i++) if (mid < keys[i + 1]) return i + (mid - keys[i]) / (keys[i + 1] - keys[i]);
    return keys.length - 1;
  },
  ease(t){ return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  at(name, s){
    const st = this.stacked(), list = st ? this.KF.stacked : this.KF.desktop;
    const i = Math.min(Math.floor(s), list.length - 1), j = Math.min(i + 1, list.length - 1), t = this.ease(Math.min(Math.max(s - i, 0), 1));
    // very short landscape screens (phones turned sideways): the contact text fills the screen, so clear the stage there
    const short = !st && innerHeight < 560, last = list.length - 1;
    const pick = n => (short && n === last) ? [list[n][name][0], list[n][name][1], list[n][name][2], 0] : list[n][name];
    const a = pick(i), b = pick(j);
    const v = a.map((x, k) => x + (b[k] - x) * t);
    if (!st){ // keep composition on narrower / wider landscape screens (designed at 16:10)
      const f = Math.min(Math.max((innerWidth / innerHeight) / 1.6, .85), 1.2);
      v[0] *= f; v[3] *= Math.min(f, 1);
    }
    return v;
  }
};

/* =====================================================================
   BOOT — load content, then start shop / news / router
   ===================================================================== */
(async function boot(){
  if (!(await window.NMN.load())) return;
  window.NMN.applyHome();
  window.NMN.ld();

/* ---------- SHOP: cart, product pages, checkout ---------- */
window.SHOP = (function(){
  const C = window.CONFIG, P = window.PRODUCTS;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const fmt = n => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";
  const bySlug = s => P.find(p => p.slug === s);
  const zaloUrl = "https://zalo.me/" + encodeURIComponent(C.zalo);
  const hasBank = !!(C.bank && C.bank.account && C.bank.code);
  // xác nhận chuyển khoản tự động: cần link Apps Script (nhận đơn + đối soát SePay)
  const autoPay = hasBank && !!C.bank.autoConfirm && !!C.orderEndpoint;
  const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rnd = n => { const a = new Uint32Array(n); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.random() * 4e9); return [...a].map(x => ABC[x % ABC.length]).join(""); };
  const payCode = code => String(code).toUpperCase().replace(/[^A-Z0-9]/g, "");   // nội dung CK: không dấu gạch (ngân hàng hay bỏ ký tự đặc biệt)
  let payTimer = null;
  const MAXQ = 99, KEY = "nmn_cart_v1", ORDERS = "nmn_orders_v1", PROFILE = "nmn_profile_v1";
  let addr = null, upsellOpen = false;
  const store = {
    get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };
  const arrow = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8h13M9 3l5 5-5 5" stroke="currentColor" fill="none" stroke-width="1.4"/></svg>';
  const check = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  /* ---------- product illustration (used when no photo is set) ---------- */
  const THEMES = {
    pearl: "linear-gradient(150deg,#fbf6ec 0%,#efe2c8 60%,#e2cba2 100%)",
    rose:  "linear-gradient(150deg,#f8ecee 0%,#e9c9d0 60%,#d2a2ae 100%)",
    duo:   "linear-gradient(150deg,#f6f1e8 0%,#e8d6bc 55%,#dcb2bc 100%)"
  };
  function bottle(cx, base, s, k){
    const W = 150 * s, H = 230 * s, x = cx - W / 2, y = base - H, r = 26 * s;
    const neckW = 80 * s, neckH = 18 * s, capW = 98 * s, capH = 58 * s, capY = y - neckH - capH + 6 * s;
    const white = k === "w";
    const lab = white ? { bg: "#fdfbf7", ink: "#13202a", acc: "#a3804c", t: "PURE NMN", s: "12,000mg+", ts: 20, ss: 17 }
                      : { bg: "#3b1020", ink: "#fbf0ea", acc: "#e6bfa6", t: "NMN", s: "Regene", ts: 32, ss: 23 };
    const ly = y + H * .3, lh = H * .42;
    let ridges = "";
    for (let i = 1; i < 9; i++) ridges += `<rect x="${(cx - capW / 2 + i * capW / 9).toFixed(1)}" y="${(capY + 8 * s).toFixed(1)}" width="${(1.3 * s).toFixed(2)}" height="${(capH - 16 * s).toFixed(1)}" fill="#000" opacity=".12"/>`;
    return `<ellipse cx="${cx}" cy="${base + 6 * s}" rx="${W * .8}" ry="${16 * s}" fill="url(#shadowG)"/>
      <rect x="${cx - neckW / 2}" y="${y - neckH}" width="${neckW}" height="${neckH + r}" fill="url(#${white ? "bW" : "bR"})"/>
      <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="${r}" fill="url(#${white ? "bW" : "bR"})"/>
      <rect x="${x}" y="${ly}" width="${W}" height="${lh}" fill="${lab.bg}"/>
      <rect x="${x}" y="${ly}" width="${W}" height="${lh}" fill="url(#labShade)"/>
      <rect x="${x}" y="${ly + 7 * s}" width="${W}" height="${1.3 * s}" fill="${lab.acc}"/>
      <rect x="${x}" y="${ly + lh - 8.3 * s}" width="${W}" height="${1.3 * s}" fill="${lab.acc}"/>
      <text x="${cx}" y="${ly + lh * .5}" text-anchor="middle" font-family="Noto Serif Display, Georgia, serif" font-weight="600" font-size="${lab.ts * s}" fill="${lab.ink}">${lab.t}</text>
      <text x="${cx}" y="${ly + lh * .78}" text-anchor="middle" font-family="Noto Serif Display, Georgia, serif" font-style="italic" font-weight="500" font-size="${lab.ss * s}" fill="${lab.acc}">${lab.s}</text>
      <rect x="${x + 14 * s}" y="${y + 12 * s}" width="${9 * s}" height="${H - 24 * s}" rx="${4.5 * s}" fill="#fff" opacity="${white ? .6 : .2}"/>
      <rect x="${cx - capW / 2}" y="${capY}" width="${capW}" height="${capH}" rx="${9 * s}" fill="url(#${white ? "capG" : "capR"})"/>${ridges}`;
  }
  function art(p){
    let g = `<circle cx="300" cy="250" r="185" fill="url(#pearl)" opacity=".85"/>
      <ellipse cx="300" cy="250" rx="255" ry="74" fill="none" stroke="#a3804c" stroke-opacity=".35" transform="rotate(-16 300 250)"/>
      <circle cx="74" cy="300" r="7" fill="#c8a66f"/><circle cx="530" cy="190" r="5" fill="#2c6a6d" opacity=".7"/>`;
    if (p.theme === "duo") g += bottle(212, 470, 1.1, "w") + bottle(392, 488, 1.1, "r");
    else g += bottle(300, 478, 1.3, p.theme === "rose" ? "r" : "w");
    return `<svg viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${g}</svg>`;
  }
  function visual(p, extra = ""){
    const media = p.image ? `<img src="${esc(window.NMN.img(p.image))}" alt="${esc(p.name)}" loading="lazy" decoding="async">` : art(p);
    return `<span class="pvis"${extra} style="--pv:${THEMES[p.theme] || THEMES.pearl}">${media}</span>`;
  }
  const priceHtml = p => `<div class="pprice"><b>${fmt(p.price)}</b>${p.compareAt && p.compareAt > p.price ? `<s>${fmt(p.compareAt)}</s><span class="off">-${Math.round((1 - p.price / p.compareAt) * 100)}%</span>` : ""}</div>`;
  const perkIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const perks = cls => `<div class="${cls}">${(C.perks || []).map(t => `<span>${perkIcon}${esc(t)}</span>`).join("")}</div>`;

  /* ---------- cart state (kept on this device) ---------- */
  let cart = store.get(KEY, []).filter(i => bySlug(i.slug) && i.qty > 0).map(i => ({ slug: i.slug, qty: Math.min(MAXQ, i.qty | 0) }));
  const count = () => cart.reduce((a, i) => a + i.qty, 0);
  const subtotal = () => cart.reduce((a, i) => a + bySlug(i.slug).price * i.qty, 0);
  function totals(){
    const sub = subtotal();
    let ship = C.shippingFee;
    if (C.freeShippingFrom != null && sub >= C.freeShippingFrom) ship = 0;
    return { sub, ship, total: sub + (ship || 0) };
  }
  const shipText = s => s == null ? "Báo khi xác nhận đơn" : s === 0 ? "Miễn phí" : fmt(s);
  function save(){ store.set(KEY, cart); paint(); }
  function add(slug, qty = 1){
    if (!bySlug(slug)) return;
    const it = cart.find(i => i.slug === slug);
    if (it) it.qty = Math.min(MAXQ, it.qty + qty); else cart.push({ slug, qty: Math.min(MAXQ, qty) });
    save();
    const b = $("[data-cart-count]"); if (b){ b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
  }
  function setQty(slug, q){
    q = Math.max(0, Math.min(MAXQ, parseInt(q, 10) || 0));
    const it = cart.find(i => i.slug === slug); if (!it) return;
    if (q === 0) cart = cart.filter(i => i !== it); else it.qty = q;
    save();
  }
  const qtyCtl = (slug, q, sm) => `<div class="qty${sm ? " sm" : ""}" role="group" aria-label="Số lượng">
      <button type="button" data-q="${esc(slug)}" data-d="-1" aria-label="Giảm số lượng">−</button>
      <input type="number" inputmode="numeric" min="1" max="${MAXQ}" value="${q}" data-qi="${esc(slug)}" aria-label="Số lượng">
      <button type="button" data-q="${esc(slug)}" data-d="1" aria-label="Tăng số lượng"${q >= MAXQ ? " disabled" : ""}>+</button></div>`;

  /* ---------- drawer ---------- */
  const drawer = $("#cart"), ov = $("#cart-ov");
  let lastFocus = null;
  function openCart(){
    if (document.body.classList.contains("cart-open")) return;
    lastFocus = document.activeElement;
    document.body.classList.add("cart-open"); drawer.setAttribute("aria-hidden", "false");
    setTimeout(() => $("#cart-close").focus({ preventScroll: true }), 50);
  }
  function closeCart(){
    if (!document.body.classList.contains("cart-open")) return;
    document.body.classList.remove("cart-open"); drawer.setAttribute("aria-hidden", "true");
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  ov.addEventListener("click", closeCart);
  $("#cart-close").addEventListener("click", closeCart);

  function paint(){
    const n = count();
    $$("[data-cart-count]").forEach(el => { el.textContent = n > 99 ? "99+" : n; el.hidden = n === 0; });
    $$("[data-cart-count-text]").forEach(el => el.textContent = n ? `(${n} sản phẩm)` : "");
    $("#cart-btn").setAttribute("aria-label", n ? `Mở giỏ hàng, ${n} sản phẩm` : "Mở giỏ hàng");
    const t = totals();
    $("#cart-items").innerHTML = cart.length ? cart.map(i => {
      const p = bySlug(i.slug);
      return `<div class="citem">
        <a href="#san-pham/${esc(p.slug)}" data-close-cart aria-label="${esc(p.name)}">${visual(p)}</a>
        <div style="min-width:0">
          <h4><a href="#san-pham/${esc(p.slug)}" data-close-cart>${esc(p.name)}</a></h4>
          <div class="unit">${fmt(p.price)} / sản phẩm</div>
          <div class="row">${qtyCtl(p.slug, i.qty, true)}<span class="line">${fmt(p.price * i.qty)}</span></div>
          <button class="rm" data-rm="${esc(p.slug)}">Xoá</button>
        </div></div>`;
    }).join("") : `<div class="cart-empty"><b>Giỏ hàng đang trống</b>Hãy chọn sản phẩm bạn quan tâm.<br><a class="btn btn-ink" href="#cua-hang" data-close-cart>Xem cửa hàng</a></div>`;
    $("#cart-foot").hidden = !cart.length;
    $("#cart-foot").innerHTML = cart.length ? `
      <div class="sumrow"><span>Tạm tính</span><span>${fmt(t.sub)}</span></div>
      <div class="sumrow"><span>Phí giao hàng</span><span class="muted">${shipText(t.ship)}</span></div>
      <div class="sumrow total"><span>Tổng cộng</span><b>${fmt(t.total)}</b></div>
      <a class="btn btn-ink" href="#thanh-toan" data-close-cart>Tiến hành đặt hàng ${arrow}</a>
      <button class="btn btn-line" data-close-cart>Tiếp tục mua sắm</button>` : "";
    if (page === "checkout"){ if (cart.length) renderSummary(); else renderCheckout(); }
  }

  /* ---------- pages ---------- */
  const root = $("#shop-root");
  let page = null;
  const card = p => `<article class="pcard glass">
      <a href="#san-pham/${esc(p.slug)}" aria-label="Xem ${esc(p.name)}" style="text-decoration:none">${visual(p).replace("</span>", `<span class="tagx">${esc(p.tag)}</span></span>`)}</a>
      <div class="pbody">
        <h3><a href="#san-pham/${esc(p.slug)}">${esc(p.name)}</a></h3>
        <p class="short">${esc(p.short)}</p>
        ${p.claim ? `<p class="claim">${esc(p.claim)}</p>` : ""}
        ${priceHtml(p)}
        <div class="pactions">
          <button class="btn btn-ink btn-sm" data-add="${esc(p.slug)}">Thêm vào giỏ</button>
          <a class="btn btn-line btn-sm" href="#san-pham/${esc(p.slug)}">Chi tiết</a>
        </div>
      </div></article>`;

  function renderList(){
    page = "list";
    window.NMN.ld();
    document.title = "Cửa hàng · " + C.brand;
    root.innerHTML = `
      <section class="shero">
        <div class="eyebrow">Cửa hàng trực tuyến</div>
        <h1>Chọn sản phẩm <em>phù hợp với bạn</em></h1>
        <p>Thực phẩm bảo vệ sức khỏe chứa NMN, sản xuất tại Nhật Bản. Thêm sản phẩm vào giỏ, điền thông tin nhận hàng và chúng tôi sẽ liên hệ xác nhận đơn.</p>
        ${perks("perks")}
      </section>
      <div class="pgrid">${P.filter(x => !x.unlisted).map(card).join("")}</div>
      <div class="steps3">
        <div class="glass"><b>i.</b><h3>Chọn sản phẩm</h3><p>Thêm sản phẩm vào giỏ hàng, điều chỉnh số lượng tuỳ ý.</p></div>
        <div class="glass"><b>ii.</b><h3>Điền thông tin</h3><p>Nhập họ tên, số điện thoại, địa chỉ nhận hàng và chọn cách thanh toán.</p></div>
        <div class="glass"><b>iii.</b><h3>Xác nhận đơn</h3><p>Chúng tôi liên hệ qua điện thoại hoặc Zalo để xác nhận và giao hàng.</p></div>
      </div>
      <p class="disclaimer" style="margin-top:28px;text-align:center">Thực phẩm này không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.</p>`;
  }

  /* Thông tin chi tiết theo hồ sơ công bố của từng sản phẩm */
  const DISCLAIMER = "Thực phẩm này không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.";
  const rows = list => (list || []).filter(r => r && (r[0] || r[1])).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("");
  const lis = list => (list || []).filter(Boolean).map(x => `<li>${esc(x)}</li>`).join("");
  function detailSections(p){
    const out = [];
    const hasIng = (p.ingredients || []).length;
    out.push(`<details open><summary>Thành phần</summary><div class="ac-body">
      ${hasIng ? `${p.ingredientsBasis ? `<p class="ac-lead">${esc(p.ingredientsBasis)}:</p>` : ""}<table>${rows(p.ingredients)}</table>${p.excipients ? `<p class="ac-small"><b>Phụ liệu:</b> ${esc(p.excipients)}</p>` : ""}`
               : `<table>${rows(p.specs)}</table>`}</div></details>`);
    if ((p.ingredientNotes || []).length) out.push(`<details><summary>Về các thành phần</summary><div class="ac-body">
      <dl class="notes">${p.ingredientNotes.filter(r => r && r[0]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      <p class="ac-small">Thông tin mô tả đặc tính của từng thành phần, không phải công dụng của sản phẩm.${p.claim ? ` Công dụng của sản phẩm: ${esc(p.claim.replace(/\.$/, "").toLowerCase())}.` : ""}</p></div></details>`);
    if (p.claim || p.target || (p.usage || []).length || p.storage) out.push(`<details><summary>Công dụng &amp; cách dùng</summary><div class="ac-body"><table>
      ${p.claim ? `<tr><td>Công dụng</td><td>${esc(p.claim)}</td></tr>` : ""}
      ${p.target ? `<tr><td>Đối tượng sử dụng</td><td>${esc(p.target)}</td></tr>` : ""}
      ${(p.usage || []).length ? `<tr><td>Hướng dẫn sử dụng</td><td>${p.usage.map(esc).join("<br>")}</td></tr>` : ""}
      ${p.storage ? `<tr><td>Bảo quản</td><td>${esc(p.storage)}</td></tr>` : ""}</table></div></details>`);
    const warn = (p.warnings || []).length ? p.warnings : [DISCLAIMER, "Không sử dụng cho người mẫn cảm, kiêng kị với bất kỳ thành phần nào của sản phẩm.", "Đọc kỹ hướng dẫn sử dụng trước khi dùng. Để xa tầm tay trẻ em."];
    out.push(`<details><summary>Lưu ý</summary><div class="ac-body"><ul>${lis(warn)}</ul></div></details>`);
    if ((p.legal || []).length) out.push(`<details><summary>Thông tin sản phẩm</summary><div class="ac-body"><table>${rows(p.legal)}</table></div></details>`);
    return out.join("");
  }

  // sản phẩm "link riêng": không cho Google lập chỉ mục
  function robots(noindex){
    let m = document.querySelector('meta[name="robots"]');
    if (noindex){ if (!m){ m = document.createElement("meta"); m.name = "robots"; document.head.appendChild(m); } m.content = "noindex, nofollow"; }
    else if (m) m.remove();
  }
  function renderProduct(slug){
    const p = bySlug(slug);
    if (!p){ history.replaceState(null, "", "#cua-hang"); return renderList(); }
    page = "product";
    document.title = p.name + " · " + C.brand;
    const others = P.filter(x => x !== p && !x.unlisted);
    robots(!!p.unlisted);
    const pics = [p.image, ...(p.gallery || [])].filter(Boolean);
    const main = pics.length ? `<span class="pvis" style="--pv:${THEMES[p.theme] || THEMES.pearl}"><img id="pd-main" src="${esc(window.NMN.img(pics[0]))}" alt="${esc(p.name)}" decoding="async"></span>` : visual(p);
    const thumbs = pics.length > 1 ? `<div class="thumbs" role="list">${pics.map((src, i) => `<button type="button" role="listitem" class="${i ? "" : "on"}" data-gal="${esc(window.NMN.img(src))}" aria-label="Ảnh ${i + 1}"><img src="${esc(window.NMN.img(src))}" alt="" loading="lazy"></button>`).join("")}</div>` : "";
    if (!p.unlisted) window.NMN.ld({ "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.desc,
      image: pics.map(window.NMN.abs), brand: { "@type": "Brand", name: "Clastive" },
      offers: { "@type": "Offer", priceCurrency: "VND", price: p.price, availability: "https://schema.org/InStock", url: location.href } });
    root.innerHTML = `
      <nav class="crumbs" aria-label="Đường dẫn"><a href="#hero">Trang chủ</a><span>/</span><a href="#cua-hang">Cửa hàng</a><span>/</span><span>${esc(p.name)}</span></nav>
      <div class="pdetail">
        <div class="pgal">${main}${thumbs}</div>
        <div class="pinfo">
          <span class="flag"${p.theme === "rose" ? ' style="color:var(--rose)"' : ""}><i></i>${esc(p.tag)}</span>
          <h1>${esc(p.name)}</h1>
          ${p.officialName ? `<p class="kind">${esc(p.officialName)}</p>` : ""}
          ${p.unlisted ? `<p class="unlisted-note">Sản phẩm không hiển thị công khai — chỉ mở được bằng đường dẫn riêng.</p>` : ""}
          <p class="short">${esc(p.short)}</p>
          ${priceHtml(p)}
          <div class="note-s">${esc(C.priceNote)}</div>
          <p class="lead2">${esc(p.desc)}</p>
          <ul class="hl">${p.highlights.map(h => `<li>${esc(h)}</li>`).join("")}</ul>
          <div class="buyrow">
            <div class="qty" role="group" aria-label="Số lượng">
              <button type="button" data-step="-1" aria-label="Giảm số lượng">−</button>
              <input type="number" id="pd-qty" inputmode="numeric" min="1" max="${MAXQ}" value="1" aria-label="Số lượng">
              <button type="button" data-step="1" aria-label="Tăng số lượng">+</button>
            </div>
            <button class="btn btn-ink" data-add="${esc(p.slug)}" data-qty-from="#pd-qty">Thêm vào giỏ</button>
            <button class="btn btn-line" data-buy="${esc(p.slug)}" data-qty-from="#pd-qty">Mua ngay</button>
          </div>
          ${perks("minis")}
          <p class="disc-line">${esc(DISCLAIMER)}</p>
          <div class="acc">${detailSections(p)}</div>
        </div>
      </div>
      ${others.length ? `<section class="related"><div class="sec-head"><div><div class="eyebrow">Có thể bạn quan tâm</div><h2>Sản phẩm <em>khác</em></h2></div></div><div class="pgrid">${others.map(card).join("")}</div></section>` : ""}`;
  }

  function renderCheckout(){
    page = "checkout";
    document.title = "Đặt hàng · " + C.brand;
    if (!cart.length){
      root.innerHTML = `<div class="done"><h1>Giỏ hàng đang trống</h1><p>Hãy thêm sản phẩm vào giỏ trước khi đặt hàng.</p><div class="cta-row"><a class="btn btn-ink" href="#cua-hang">Xem cửa hàng ${arrow}</a></div></div>`;
      return;
    }
    const saved = store.get(PROFILE, {}), optedOut = !!store.get(PROFILE + "_off", 0);
    root.innerHTML = `
      <nav class="crumbs" aria-label="Đường dẫn"><a href="#cua-hang">Cửa hàng</a><span>/</span><span>Đặt hàng</span></nav>
      <h1 class="co-title">Thông tin <em>đặt hàng</em></h1>
      <p class="co-sub">Điền thông tin nhận hàng. Chúng tôi sẽ liên hệ xác nhận trước khi giao.</p>
      <form class="co" id="co-form" novalidate>
        <div>
          <div class="fs glass">
            <h3>Người nhận</h3>
            <div class="fgrid">
              <div class="f"><label for="f-name">Họ và tên <i>*</i></label><input id="f-name" name="name" autocomplete="name" required maxlength="80" value="${esc(saved.name || "")}"><span class="msg"></span></div>
              <div class="f"><label for="f-phone">Số điện thoại <i>*</i></label><input id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required maxlength="16" placeholder="09xx xxx xxx" value="${esc(saved.phone || "")}"><span class="msg"></span></div>
              <div class="f full"><label for="f-email">Email <small style="color:var(--muted);font-weight:400">(không bắt buộc)</small></label><input id="f-email" name="email" type="email" autocomplete="email" maxlength="120" value="${esc(saved.email || "")}"><span class="msg"></span></div>
            </div>
          </div>
          <div class="fs glass">
            <h3>Địa chỉ nhận hàng</h3>
            <p class="fs-sub">Theo đơn vị hành chính mới: Tỉnh/Thành phố → Phường/Xã (không còn quận/huyện). Gõ không dấu cũng tìm được.</p>
            <div id="co-addr"></div>
            <div class="fgrid" style="margin-top:14px">
              <div class="f full"><label for="f-note">Ghi chú</label><textarea id="f-note" name="note" maxlength="500" placeholder="Thời gian nhận hàng, yêu cầu khác…"></textarea></div>
              <div class="f full"><label class="consent"><input type="checkbox" name="remember" id="f-remember"${optedOut ? "" : " checked"}><span>Lưu thông tin nhận hàng trên thiết bị này để lần sau đặt nhanh hơn</span></label></div>
            </div>
          </div>
          <div class="fs glass">
            <h3>Thanh toán</h3>
            <div class="pay">
              <label class="on"><input type="radio" name="pay" value="cod" checked><span><b>Thanh toán khi nhận hàng (COD)</b><small>Trả tiền mặt cho nhân viên giao hàng.</small></span></label>
              ${hasBank ? `<label><input type="radio" name="pay" value="bank"><span><b>Chuyển khoản ngân hàng · VietQR</b><small>${autoPay ? "Quét mã QR bằng app ngân hàng — đơn được xác nhận tự động ngay khi nhận tiền." : "Mã QR và thông tin tài khoản hiện ngay sau khi đặt hàng."}</small></span></label>` : ""}
            </div>
          </div>
        </div>
        <aside class="osum glass" id="osum"></aside>
      </form>`;
    renderSummary();
    const form = $("#co-form");
    addr = window.VNAddress.mount($("#co-addr"), { value: saved });
    $("#co-addr").addEventListener("vna:toast", e => toast(e.detail));
    form.addEventListener("change", e => { if (e.target.name === "pay") $$(".pay label").forEach(l => l.classList.toggle("on", l.contains(e.target))); });
    form.addEventListener("input", e => { const f = e.target.closest(".f"); if (f && f.classList.contains("err")) { f.classList.remove("err"); f.querySelector(".msg").textContent = ""; } });
    form.addEventListener("submit", e => { e.preventDefault(); submit(form); });
  }
  function renderSummary(){
    const box = $("#osum"); if (!box) return;
    const t = totals();
    // giữ vị trí con trỏ (bàn phím) sau khi vẽ lại
    const a = document.activeElement, keep = a && box.contains(a) ? (a.dataset.oq ? `[data-oq="${a.dataset.oq}"][data-d="${a.dataset.d}"]` : a.dataset.oadd ? "[data-oadd]" : a.dataset.qv ? `[data-qv="${a.dataset.qv}"]` : a.hasAttribute("data-oexp") ? "[data-oexp]" : null) : null;
    // "Thêm vào đơn": chỉ hiện vài sản phẩm, phần còn lại ẩn sau nút Xem thêm
    const U = Object.assign({ enabled: true, title: "Thêm vào đơn", max: 2 }, C.upsell || {});
    const more = U.enabled === false ? [] : P.filter(p => p.visible !== false && !p.unlisted && p.upsell !== false && !cart.some(i => i.slug === p.slug));
    const lim = Math.max(1, parseInt(U.max, 10) || 2), hidden = Math.max(0, more.length - lim);
    const chips = upsellOpen ? more : more.slice(0, lim);
    const one = cart.length === 1;
    box.innerHTML = `<h3>Đơn hàng <small style="font-family:var(--sans);font-size:13px;color:var(--muted);font-weight:400">(${count()} sản phẩm)</small></h3>
      ${cart.map(i => { const p = bySlug(i.slug), n = esc(p.name); return `<div class="oitem"><button type="button" class="oi-vis" data-qv="${esc(p.slug)}" aria-haspopup="dialog" aria-label="Xem chi tiết ${n}">${visual(p)}</button><div class="oi-main"><button type="button" class="n" data-qv="${esc(p.slug)}" aria-haspopup="dialog">${n}</button><div class="q">${fmt(p.price)} / sản phẩm</div>
        <div class="oi-ctl"><div class="qty sm" role="group" aria-label="Số lượng ${n}">
          <button type="button" data-oq="${esc(p.slug)}" data-d="-1" aria-label="Giảm số lượng ${n}"${i.qty <= 1 ? " disabled" : ""}>−</button>
          <input type="number" inputmode="numeric" min="1" max="${MAXQ}" value="${i.qty}" data-oqi="${esc(p.slug)}" aria-label="Số lượng ${n}">
          <button type="button" data-oq="${esc(p.slug)}" data-d="1" aria-label="Tăng số lượng ${n}"${i.qty >= MAXQ ? " disabled" : ""}>+</button></div>
          ${one ? "" : `<button type="button" class="oi-rm" data-orm="${esc(p.slug)}" aria-label="Xoá ${n} khỏi đơn">Xoá</button>`}</div></div>
        <div class="p">${fmt(p.price * i.qty)}</div></div>`; }).join("")}
      ${more.length ? `<div class="omore" id="omore"><span>${esc(U.title || "Thêm vào đơn")}</span>${chips.map(p => `<div class="ocard">
          <button type="button" class="ocard-main" data-qv="${esc(p.slug)}" aria-haspopup="dialog" aria-label="Xem chi tiết ${esc(p.name)}">${visual(p)}<span class="t"><b>${esc(p.name)}</b><small>${esc(p.claim ? p.claim.replace(/\.$/, "") : p.short || "")}</small><span class="pr">${fmt(p.price)}<i>Xem chi tiết ›</i></span></span></button>
          <button type="button" class="ocard-add" data-oadd="${esc(p.slug)}" aria-label="Thêm ${esc(p.name)} vào đơn">+ Thêm</button></div>`).join("")}
        ${hidden ? `<button type="button" class="omore-t" data-oexp aria-expanded="${upsellOpen}" aria-controls="omore">${upsellOpen ? "Thu gọn" : `Xem thêm ${hidden} sản phẩm`}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>` : ""}</div>` : ""}
      <div class="sums" aria-live="polite">
        <div class="sumrow"><span>Tạm tính</span><span>${fmt(t.sub)}</span></div>
        <div class="sumrow"><span>Phí giao hàng</span><span class="muted">${shipText(t.ship)}</span></div>
        <div class="sumrow total"><span>Tổng cộng</span><b>${fmt(t.total)}</b></div>
      </div>
      <button class="btn btn-ink" type="submit" id="co-submit">Đặt hàng ${arrow}</button>
      <p class="fine">Bằng việc đặt hàng, bạn đồng ý để chúng tôi liên hệ qua số điện thoại đã cung cấp nhằm xác nhận và giao đơn hàng.</p>`;
    if (keep){ const el = box.querySelector(keep); if (el && !el.disabled) el.focus({ preventScroll: true }); else box.querySelector("[data-oqi]")?.focus({ preventScroll: true }); }
  }

  /* ---------- xem nhanh sản phẩm (popup) ---------- */
  let qvOpener = null;
  function quickView(slug, opener){
    const p = bySlug(slug); if (!p) return;
    let dlg = $("#qv");
    if (!dlg){
      dlg = document.createElement("dialog"); dlg.id = "qv"; dlg.className = "qv"; dlg.setAttribute("aria-labelledby", "qv-title");
      document.body.appendChild(dlg);
      dlg.addEventListener("click", e => {
        if (e.target === dlg || e.target.closest("[data-qv-close]")) return dlg.close();
        const st = e.target.closest("[data-qvs]");
        if (st){ const i = $("#qv-q"); i.value = Math.max(1, Math.min(MAXQ, (parseInt(i.value, 10) || 1) + Number(st.dataset.qvs))); return; }
        const go = e.target.closest("[data-qv-add]");
        if (go){
          const q = Math.max(1, Math.min(MAXQ, parseInt($("#qv-q").value, 10) || 1)), s2 = go.dataset.qvAdd;
          add(s2, q); dlg.close(); toast(`Đã thêm ${q} × ${bySlug(s2).name} vào đơn`);
        }
      });
      dlg.addEventListener("close", () => {
        document.documentElement.classList.remove("qv-open");
        const o = qvOpener; qvOpener = null;
        const back = o && document.contains(o) ? o : (o && o.dataset && o.dataset.qv ? $(`#osum [data-qv="${o.dataset.qv}"]`) || $(`#osum [data-oadd="${o.dataset.qv}"]`) : null);
        if (back) back.focus({ preventScroll: true });
      });
    }
    const L = Object.fromEntries((p.legal || []).filter(r => r && r[0]).map(r => [r[0], r[1]]));
    const allLegal = (p.legal || []).map(r => r[1]).join(" ");
    const origin = L["Xuất xứ"] || ((p.specs || []).find(r => r[0] === "Xuất xứ") || [])[1];
    const trust = [
      origin && `Sản xuất tại ${origin}`,
      L["Số ĐKSP"] ? `Số ĐKSP ${L["Số ĐKSP"]}` : /ĐKSP/.test(allLegal) && "Có số ĐKSP cho từng sản phẩm",
      L["Số XNQC"] ? `Số XNQC ${L["Số XNQC"]}` : /XNQC/.test(allLegal) && "Có số XNQC cho từng sản phẩm",
      ...(C.perks || []).filter(t => !/nhật bản/i.test(t))
    ].filter(Boolean);
    const inCart = cart.find(i => i.slug === slug);
    const facts = (p.specs || []).filter(r => r && r[0] && r[0] !== "Xuất xứ").slice(0, 3);
    dlg.innerHTML = `
      <button type="button" class="qv-x" data-qv-close aria-label="Đóng"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      <div class="qv-scroll">
        <div class="qv-top">
          <div class="qv-vis">${visual(p)}</div>
          <div class="qv-head">
            ${p.officialName ? `<p class="kind">${esc(p.officialName)}</p>` : ""}
            <h2 id="qv-title">${esc(p.name)}</h2>
            ${p.claim ? `<p class="qv-claim"><span>Công dụng</span>${esc(p.claim)}</p>` : ""}
            ${priceHtml(p)}
          </div>
        </div>
        ${trust.length ? `<ul class="qv-trust">${trust.map(t => `<li>${perkIcon}${esc(t)}</li>`).join("")}</ul>` : ""}
        ${facts.length ? `<dl class="qv-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
        ${p.desc ? `<p class="qv-desc">${esc(p.desc)}</p>` : ""}
        <div class="acc">${detailSections(p)}</div>
        <p class="disc-line">${DISCLAIMER}</p>
        <p class="qv-more"><a href="${location.pathname}#san-pham/${esc(p.slug)}" target="_blank" rel="noopener">Mở trang sản phẩm đầy đủ ↗</a></p>
      </div>
      <div class="qv-foot">
        <div class="qty" role="group" aria-label="Số lượng">
          <button type="button" data-qvs="-1" aria-label="Giảm số lượng">−</button>
          <input id="qv-q" type="number" inputmode="numeric" min="1" max="${MAXQ}" value="1" aria-label="Số lượng">
          <button type="button" data-qvs="1" aria-label="Tăng số lượng">+</button>
        </div>
        <button type="button" class="btn btn-ink" data-qv-add="${esc(p.slug)}">${inCart ? "Thêm nữa vào đơn" : "Thêm vào đơn"} ${arrow}</button>
        ${inCart ? `<p class="qv-in">Đơn hàng đang có ${inCart.qty} sản phẩm này.</p>` : ""}
      </div>`;
    $("#qv-q").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); dlg.querySelector("[data-qv-add]").click(); } });
    qvOpener = opener || document.activeElement;
    document.documentElement.classList.add("qv-open");
    if (!dlg.open) dlg.showModal();
    dlg.querySelector(".qv-scroll").scrollTop = 0;
    dlg.querySelector(".qv-x").focus({ preventScroll: true });
  }

  function fieldError(form, name, msg){
    const f = form.querySelector(`[name="${name}"]`).closest(".f");
    f.classList.add("err"); f.querySelector(".msg").textContent = msg;
  }
  async function submit(form){
    if (!cart.length) return renderCheckout();
    const d = Object.fromEntries(new FormData(form));
    Object.keys(d).forEach(k => d[k] = String(d[k]).trim());
    const phone = d.phone.replace(/[\s.\-()]/g, "");
    let bad = [];
    if (d.name.length < 2) bad.push(["name", "Vui lòng nhập họ và tên."]);
    if (!/^(0|\+?84)(3|5|7|8|9)\d{8}$/.test(phone)) bad.push(["phone", "Số điện thoại chưa đúng (ví dụ 0912 345 678)."]);
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) bad.push(["email", "Email chưa đúng định dạng."]);
    bad.forEach(([n, m]) => fieldError(form, n, m));
    const badAddr = addr ? addr.validate() : [];
    if (bad.length || badAddr.length){
      const firstF = bad.length ? form.querySelector(`[name="${bad[0][0]}"]`).closest(".f") : badAddr[0];
      const first = firstF.querySelector("input:not([disabled]),textarea") || firstF;
      first.focus({ preventScroll: true }); firstF.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const a = addr.get();
    if (d.remember){ try { localStorage.removeItem(PROFILE + "_off"); } catch (_) {} } if (d.remember) store.set(PROFILE, { name: d.name, phone: d.phone, email: d.email, provinceCode: a.provinceCode, wardCode: a.wardCode, street: a.street });
    else { try { localStorage.removeItem(PROFILE); } catch (_) {} store.set(PROFILE + "_off", 1); }
    const btn = $("#co-submit"); btn.disabled = true; btn.textContent = "Đang gửi đơn…";
    const now = new Date(), t = totals();
    const code = "NMN-" + String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0") + "-" + rnd(5);
    const order = {
      code, createdAt: now.toISOString(),
      customer: { name: d.name, phone, email: d.email, city: a.province, address: [a.street, a.ward].filter(Boolean).join(", "),
        province: a.province, provinceCode: a.provinceCode, ward: a.ward, wardCode: a.wardCode, street: a.street, fullAddress: a.full, note: d.note },
      payment: d.pay === "bank" && hasBank ? "bank" : "cod", payCode: payCode(code),
      items: cart.map(i => { const p = bySlug(i.slug); return { slug: p.slug, name: p.name, price: p.price, qty: i.qty, lineTotal: p.price * i.qty }; }),
      subtotal: t.sub, shipping: t.ship, total: t.total, sent: false
    };
    if (C.orderEndpoint){
      try {
        await fetch(C.orderEndpoint, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(order) });
        order.sent = true;
      } catch (_) { order.sent = false; }
    }
    const orders = store.get(ORDERS, []); orders.unshift(order); store.set(ORDERS, orders.slice(0, 10));
    page = "submitting"; cart = []; save();
    location.hash = "#don-hang/" + code;
  }

  function orderText(o){
    const head = [
      `ĐƠN HÀNG ${o.code}`,
      `Khách hàng: ${o.customer.name}`,
      `Điện thoại: ${o.customer.phone}`,
      o.customer.email && `Email: ${o.customer.email}`,
      `Địa chỉ: ${o.customer.address}, ${o.customer.city}`
    ].filter(Boolean);
    const items = o.items.map(i => `- ${i.name} × ${i.qty} = ${fmt(i.lineTotal)}`);
    const foot = [
      `Tạm tính: ${fmt(o.subtotal)}`,
      `Phí giao hàng: ${shipText(o.shipping)}`,
      `Tổng cộng: ${fmt(o.total)}`,
      `Thanh toán: ${o.payment === "bank" ? "Chuyển khoản ngân hàng" : "Thanh toán khi nhận hàng (COD)"}`,
      o.customer.note && `Ghi chú: ${o.customer.note}`
    ].filter(Boolean);
    return [head.join("\n"), items.join("\n"), foot.join("\n")].join("\n\n");
  }
  function renderDone(code){
    page = "done";
    const o = store.get(ORDERS, []).find(x => x.code === code);
    document.title = "Đơn hàng " + code + " · " + C.brand;
    if (!o){
      root.innerHTML = `<div class="done"><h1>Không tìm thấy đơn hàng</h1><p>Đơn hàng ${esc(code)} không có trên thiết bị này. Nếu cần hỗ trợ, vui lòng liên hệ hotline.</p><div class="cta-row"><a class="btn btn-ink" href="#cua-hang">Về cửa hàng</a><a class="btn btn-line" href="tel:${esc(C.phone)}">Gọi ${esc(C.phone)}</a></div></div>`;
      return;
    }
    const txt = orderText(o);
    const bank = o.payment === "bank" && hasBank, auto = bank && autoPay && o.sent;
    const head = o.paid
      ? `<h1>Thanh toán <em>thành công!</em></h1><p>Chúng tôi đã nhận ${fmt(o.paidAmount || o.total)} cho đơn hàng này và sẽ liên hệ qua số ${esc(o.customer.phone)} trước khi giao.</p>`
      : bank && o.sent
      ? `<h1>Đã nhận đơn — <em>mời bạn thanh toán</em></h1><p>Quét mã QR bên dưới bằng app ngân hàng. ${auto ? "Trang sẽ tự cập nhật ngay khi chúng tôi nhận được tiền." : "Sau khi chuyển khoản, chúng tôi sẽ kiểm tra và liên hệ xác nhận."}</p>`
      : o.sent
      ? `<h1>Cảm ơn bạn đã <em>đặt hàng!</em></h1><p>Chúng tôi đã nhận được đơn và sẽ liên hệ qua số ${esc(o.customer.phone)} để xác nhận trước khi giao.</p>`
      : `<h1>Còn một bước để <em>hoàn tất đơn</em></h1><p>Vui lòng gửi thông tin đơn hàng cho chúng tôi qua Zalo (nội dung đã được soạn sẵn bên dưới) hoặc gọi hotline để xác nhận.</p>`;
    root.innerHTML = `
      <div class="done">
        <div class="ok">${check}</div>
        ${head}
        <div class="code">${esc(o.code)}</div>
        ${o.sent ? "" : `<div class="cta-row"><button class="btn btn-ink" data-zalo-order="${esc(o.code)}">Gửi đơn qua Zalo ${arrow}</button><a class="btn btn-line" href="tel:${esc(C.phone.replace(/\s+/g, ""))}">Gọi ${esc(C.phone)}</a></div>`}
        ${bank ? `<div class="box glass pay-box" id="pay-box">${payBox(o, auto)}</div>` : ""}
        <div class="box glass">
          <h3>Nội dung đơn hàng</h3>
          <textarea id="order-text" readonly aria-label="Nội dung đơn hàng">${esc(txt)}</textarea>
          <div class="btns"><button class="btn btn-line" data-copy-order>Sao chép nội dung</button><a class="btn btn-ink" href="#cua-hang">Tiếp tục mua sắm</a></div>
        </div>
      </div>`;
    watchPay(o);
  }

  /* ---------- chuyển khoản: QR + thông tin + trạng thái realtime ---------- */
  const qrUrl = (amount, info) => `https://img.vietqr.io/image/${encodeURIComponent(C.bank.code)}-${encodeURIComponent(C.bank.account)}-compact2.png?amount=${Math.max(0, Math.round(amount))}&addInfo=${encodeURIComponent(info)}&accountName=${encodeURIComponent(C.bank.owner || "")}`;
  const copyIco = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
  const cp = (val, label) => `<button type="button" class="cp" data-copy-val="${esc(val)}" data-copy-label="${esc(label)}" aria-label="Sao chép ${esc(label)}">${copyIco}<span>Sao chép</span></button>`;
  function payBox(o, auto){
    if (o.paid) return `<div class="pay-ok"><div class="ok">${check}</div><div><h3>Đã nhận thanh toán</h3><p>${fmt(o.paidAmount || o.total)}${o.paidAt ? ` · ${esc(new Date(o.paidAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }))}` : ""} · Nội dung ${esc(payCode(o.code))}</p></div></div>`;
    const pc = payCode(o.code), due = Math.max(0, o.total - (o.paidAmount || 0));
    return `
      <div class="pay-head"><h3>Chuyển khoản ngân hàng</h3>${auto ? `<span class="pay-st" id="pay-st" data-s="wait"><i></i><span>Đang chờ thanh toán</span></span>` : ""}</div>
      ${o.paidAmount ? `<p class="pay-part" role="status">Đã nhận ${fmt(o.paidAmount)} — còn thiếu <b>${fmt(due)}</b>. Vui lòng chuyển thêm với cùng nội dung.</p>` : ""}
      <div class="pay-grid">
        <figure class="qrw"><img src="${esc(qrUrl(due, pc))}" alt="Mã VietQR chuyển ${fmt(due)} cho đơn ${esc(o.code)}" width="220" height="220" loading="lazy">
          <figcaption>Quét bằng app ngân hàng — số tiền và nội dung được điền sẵn</figcaption></figure>
        <dl class="pay-dl">
          <div><dt>Ngân hàng</dt><dd>${esc(C.bank.name || C.bank.code)}</dd></div>
          <div><dt>Số tài khoản</dt><dd><b>${esc(C.bank.account)}</b>${cp(C.bank.account, "số tài khoản")}</dd></div>
          ${C.bank.owner ? `<div><dt>Chủ tài khoản</dt><dd>${esc(C.bank.owner)}</dd></div>` : ""}
          <div><dt>Số tiền</dt><dd><b>${fmt(due)}</b>${cp(String(due), "số tiền")}</dd></div>
          <div class="must"><dt>Nội dung</dt><dd><b>${esc(pc)}</b>${cp(pc, "nội dung chuyển khoản")}</dd></div>
        </dl>
      </div>
      <ol class="pay-steps">
        <li>Mở app ngân hàng → <b>Quét mã QR</b> (hoặc chuyển thủ công theo thông tin trên).</li>
        <li>Giữ đúng nội dung <b>${esc(pc)}</b> để đơn được nhận diện.</li>
        <li>${auto ? "Giữ trang này mở — trạng thái tự chuyển sang <b>Đã thanh toán</b> sau vài giây." : "Sau khi chuyển, bấm “Gửi xác nhận qua Zalo” để chúng tôi kiểm tra nhanh hơn."}</li>
      </ol>
      <div class="pay-act">${auto ? `<button type="button" class="btn btn-line" data-pay-check>Tôi đã chuyển khoản — kiểm tra ngay</button>` : `<button type="button" class="btn btn-ink" data-zalo-order="${esc(o.code)}">Gửi xác nhận qua Zalo ${arrow}</button>`}</div>
      ${o.shipping == null ? `<p class="fine">Số tiền trên chưa gồm phí giao hàng; phí giao hàng (nếu có) sẽ được báo khi xác nhận đơn.</p>` : ""}`;
  }
  function saveOrder(o){ const list = store.get(ORDERS, []); const i = list.findIndex(x => x.code === o.code); if (i >= 0){ list[i] = o; store.set(ORDERS, list); } }
  function setPaySt(s, text){ const el = $("#pay-st"); if (el){ el.dataset.s = s; el.querySelector("span").textContent = text; } }
  function watchPay(o){
    clearTimeout(payTimer);
    if (!(o.payment === "bank" && autoPay && o.sent) || o.paid) return;
    const started = Date.now(), url = C.orderEndpoint + (C.orderEndpoint.includes("?") ? "&" : "?") + "action=status&code=" + encodeURIComponent(o.code);
    let lastPaid = o.paidAmount || 0, busy = false;
    const here = () => page === "done" && decodeURIComponent(location.hash) === "#don-hang/" + o.code;
    async function tick(force){
      clearTimeout(payTimer);
      if (!here()) return;
      if (document.hidden && !force){ payTimer = setTimeout(tick, 3000); return; }
      if (busy) return; busy = true;
      try {
        const j = await fetch(url, { cache: "no-store" }).then(r => r.json());
        if (!here()) return;
        if (j.status === "paid"){
          Object.assign(o, { paid: true, paidAmount: Number(j.paid) || o.total, paidAt: j.at || new Date().toISOString() }); saveOrder(o);
          renderDone(o.code); window.scrollTo({ top: 0, behavior: "smooth" }); toast("Đã nhận thanh toán — cảm ơn bạn!"); return;
        }
        if (j.status === "partial" && Number(j.paid) !== lastPaid){
          lastPaid = o.paidAmount = Number(j.paid); saveOrder(o); $("#pay-box").innerHTML = payBox(o, true);
        }
        if (j.status === "off"){ setPaySt("idle", "Chúng tôi sẽ kiểm tra và xác nhận thủ công"); return; }
        setPaySt("wait", j.status === "partial" ? "Đã nhận một phần — chờ phần còn lại" : "Đang chờ thanh toán");
      } catch (_) { setPaySt("err", "Đang kết nối lại…"); }
      finally { busy = false; }
      const age = Date.now() - started, wait = age < 10 * 60e3 ? 4000 : age < 60 * 60e3 ? 15000 : 0;
      if (wait) payTimer = setTimeout(tick, wait);
      else setPaySt("idle", "Chưa thấy giao dịch — bấm “kiểm tra ngay” sau khi chuyển");
    }
    watchPay.check = () => tick(true);
    tick();
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && watchPay.check && page === "done") watchPay.check(); });

  async function copy(text){
    try {
      if (navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(text); return true; }
    } catch (_) {}
    const ta = $("#order-text");
    if (ta){ ta.focus(); ta.select(); try { return document.execCommand("copy"); } catch (_) {} }
    return false;
  }
  function toast(msg){
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ---------- events ---------- */
  document.addEventListener("click", async e => {
    const t = e.target;
    const addB = t.closest("[data-add]"), buyB = t.closest("[data-buy]");
    if (addB || buyB){
      const el = addB || buyB, slug = el.dataset.add || el.dataset.buy;
      const src = el.dataset.qtyFrom && $(el.dataset.qtyFrom);
      const q = src ? Math.max(1, Math.min(MAXQ, parseInt(src.value, 10) || 1)) : 1;
      add(slug, q);
      if (buyB){ location.hash = "#thanh-toan"; return; }
      toast(`Đã thêm ${bySlug(slug).name} vào giỏ`);
      openCart();
      return;
    }
    if (t.closest("[data-cart-open]")){ e.preventDefault(); openCart(); return; }
    const oq = t.closest("[data-oq]");
    if (oq){ const it = cart.find(i => i.slug === oq.dataset.oq); if (it) setQty(it.slug, Math.max(1, it.qty + Number(oq.dataset.d))); return; }
    const orm = t.closest("[data-orm]");
    if (orm){ if (cart.length > 1){ const p = bySlug(orm.dataset.orm); setQty(orm.dataset.orm, 0); toast(`Đã xoá ${p.name} khỏi đơn`); } return; }
    const qvb = t.closest("[data-qv]");
    if (qvb && !t.closest("#qv")){ quickView(qvb.dataset.qv, qvb); return; }
    if (t.closest("[data-oexp]")){ upsellOpen = !upsellOpen; renderSummary(); return; }
    const oadd = t.closest("[data-oadd]");
    if (oadd){ add(oadd.dataset.oadd, 1); toast(`Đã thêm ${bySlug(oadd.dataset.oadd).name} vào đơn`); return; }
    const qb = t.closest("[data-q]");
    if (qb){ const it = cart.find(i => i.slug === qb.dataset.q); if (it) setQty(it.slug, it.qty + Number(qb.dataset.d)); return; }
    const rm = t.closest("[data-rm]");
    if (rm){ setQty(rm.dataset.rm, 0); return; }
    const gal = t.closest("[data-gal]");
    if (gal){ const m = $("#pd-main"); if (m) m.src = gal.dataset.gal; $$(".thumbs button").forEach(b => b.classList.toggle("on", b === gal)); return; }
    const st = t.closest("[data-step]");
    if (st){ const inp = $("#pd-qty"); if (inp) inp.value = Math.max(1, Math.min(MAXQ, (parseInt(inp.value, 10) || 1) + Number(st.dataset.step))); return; }
    if (t.closest("[data-close-cart]")){ closeCart(); return; }
    const cv = t.closest("[data-copy-val]");
    if (cv){
      const v = cv.dataset.copyVal; let ok = false;
      try { if (navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(v); ok = true; } } catch (_) {}
      if (!ok){ const ta = document.createElement("textarea"); ta.value = v; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); try { ok = document.execCommand("copy"); } catch (_) {} ta.remove(); }
      toast(ok ? `Đã sao chép ${cv.dataset.copyLabel}: ${v}` : v); cv.classList.add("done"); setTimeout(() => cv.classList.remove("done"), 1500); return;
    }
    if (t.closest("[data-pay-check]")){ toast("Đang kiểm tra giao dịch…"); watchPay.check && watchPay.check(); return; }
    if (t.closest("[data-copy-order]")){ const ok = await copy($("#order-text").value); toast(ok ? "Đã sao chép nội dung đơn hàng" : "Hãy chọn và sao chép nội dung thủ công"); return; }
    const zo = t.closest("[data-zalo-order]");
    if (zo){
      const ok = await copy($("#order-text").value);
      toast(ok ? "Đã sao chép đơn hàng — dán vào khung chat Zalo" : "Hãy sao chép nội dung đơn hàng rồi dán vào Zalo");
      window.open(zaloUrl, "_blank", "noopener");
    }
  });
  document.addEventListener("change", e => {
    const qi = e.target.closest("[data-qi]"); if (qi) setQty(qi.dataset.qi, qi.value);
    const oqi = e.target.closest("[data-oqi]"); if (oqi) setQty(oqi.dataset.oqi, Math.max(1, parseInt(oqi.value, 10) || 1));
    if (e.target.id === "pd-qty") e.target.value = Math.max(1, Math.min(MAXQ, parseInt(e.target.value, 10) || 1));
  });
  // Enter trong ô số lượng ở trang đặt hàng: cập nhật số lượng, không gửi đơn
  document.addEventListener("keydown", e => { const oqi = e.target.closest && e.target.closest("[data-oqi]"); if (oqi && e.key === "Enter"){ e.preventDefault(); setQty(oqi.dataset.oqi, Math.max(1, parseInt(oqi.value, 10) || 1)); } });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && document.body.classList.contains("cart-open")) { e.stopImmediatePropagation(); closeCart(); } }, true);
  addEventListener("storage", e => { if (e.key === KEY){ cart = store.get(KEY, []).filter(i => bySlug(i.slug) && i.qty > 0); paint(); } });

  paint();

  return {
    priceOf: slug => { const p = bySlug(slug); return p ? fmt(p.price) : ""; },
    match: h => /^(cua-hang|thanh-toan|san-pham\/.+|don-hang\/.+)$/.test(h),
    leave(){ page = null; clearTimeout(payTimer); closeCart(); robots(false); },
    render(h){
      closeCart(); robots(false);
      if (h === "cua-hang") renderList();
      else if (h === "thanh-toan") renderCheckout();
      else if (h.startsWith("san-pham/")) renderProduct(h.slice(9));
      else if (h.startsWith("don-hang/")) renderDone(h.slice(9));
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  };
})();

/* =====================================================================
   LIÊN HỆ — #lien-he
   Kênh liên hệ, biểu mẫu gửi lời nhắn, thông tin doanh nghiệp, bản đồ, câu hỏi thường gặp.
   Biểu mẫu: có "formEndpoint" → gửi thẳng (Google Apps Script); không có → chép nội dung + mở Zalo / email.
   ===================================================================== */
window.CONTACT = (function(){
  const C = window.CONFIG, P = (window.PRODUCTS || []).filter(p => p.visible !== false && !p.unlisted);
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const { esc, emph } = window.NMN;
  const K = Object.assign({ topics: [], faq: [], showMap: true }, C.contact || {});
  const CO = C.company || {};
  const address = C.address || CO.address || "";
  const email = C.email || CO.email || "";
  const tel = s => String(s || "").replace(/[^\d+]/g, "");
  const nicePhone = s => { const d = tel(s); return d.length === 10 ? d.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3") : (s || ""); };
  const zaloUrl = "https://zalo.me/" + encodeURIComponent(tel(C.zalo));
  const mapsUrl = q => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  const arrow = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8h13M9 3l5 5-5 5" stroke="currentColor" fill="none" stroke-width="1.4"/></svg>';
  const I = {
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h2.6l1.4 4.1-2 1.4a12 12 0 0 0 6.4 6.4l1.4-2 4.1 1.4v2.6A2 2 0 0 1 18.4 19.5 15.9 15.9 0 0 1 4.5 5.6a2 2 0 0 1 2.1-2.1z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10.5H9.5L5 19.5V16H4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };
  let last = null;     // last submitted message (for the "done" panel)

  function channels(){
    const out = [];
    if (C.phone) out.push(`<a class="chan glass" href="tel:${esc(tel(C.phone))}"><span class="ic">${I.phone}</span><span class="lb">Hotline</span><b>${esc(nicePhone(C.phone))}</b><span class="go">Gọi ngay ${arrow}</span></a>`);
    if (C.zalo) out.push(`<a class="chan glass" href="${esc(zaloUrl)}" target="_blank" rel="noopener"><span class="ic">${I.chat}</span><span class="lb">Zalo</span><b>${esc(nicePhone(C.zalo))}</b><span class="go">Nhắn tin ${arrow}</span></a>`);
    if (email) out.push(`<a class="chan glass" href="mailto:${esc(email)}"><span class="ic">${I.mail}</span><span class="lb">Email</span><b class="mail">${esc(email)}</b><span class="go">Gửi email ${arrow}</span></a>`);
    if (address) out.push(`<a class="chan glass" href="${esc(mapsUrl(K.mapQuery || address))}" target="_blank" rel="noopener"><span class="ic">${I.pin}</span><span class="lb">Văn phòng</span><b class="addr">${esc(address)}</b><span class="go">Chỉ đường ${arrow}</span></a>`);
    return out.join("");
  }

  function info(){
    const rows = [
      ["Doanh nghiệp", CO.name], ["Mã số doanh nghiệp", CO.taxCode], ["Địa chỉ", CO.address],
      ["Điện thoại", CO.phone && nicePhone(CO.phone)], ["Email", CO.email]
    ].filter(r => r[1]);
    const q = K.mapQuery || address;
    return `<aside class="cinfo">
      ${rows.length ? `<div class="fs glass"><h3>Thông tin doanh nghiệp</h3><dl>${rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join("")}</dl>
        <p class="fine">Thương nhân chịu trách nhiệm về sản phẩm PURE NMN 12,000mg+ và NMN Regene.</p></div>` : ""}
      ${K.hours ? `<div class="fs glass hours"><span class="ic">${I.clock}</span><div><h3>Giờ làm việc</h3><p>${esc(K.hours).replace(/\n/g, "<br>")}</p></div></div>` : ""}
      ${K.showMap !== false && q ? `<div class="cmap glass"><iframe title="Bản đồ: ${esc(q)}" src="https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>` : ""}
    </aside>`;
  }

  function form(){
    const topics = K.topics.length ? K.topics : ["Tư vấn sản phẩm", "Khác"];
    return `<form class="fs glass cform" id="ct-form" novalidate>
      <h3>Gửi lời nhắn</h3>
      <p class="co-sub">Để lại thông tin, chúng tôi sẽ liên hệ lại qua điện thoại hoặc Zalo.</p>
      <div class="fgrid">
        <div class="f"><label for="ct-name">Họ và tên <i>*</i></label><input id="ct-name" name="name" autocomplete="name" required maxlength="80"><span class="msg"></span></div>
        <div class="f"><label for="ct-phone">Số điện thoại <i>*</i></label><input id="ct-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required maxlength="16" placeholder="09xx xxx xxx"><span class="msg"></span></div>
        <div class="f full"><label for="ct-email">Email <small>(không bắt buộc)</small></label><input id="ct-email" name="email" type="email" autocomplete="email" maxlength="120"><span class="msg"></span></div>
        <div class="f"><label for="ct-topic">Chủ đề</label><select id="ct-topic" name="topic">${topics.map(t => `<option>${esc(t)}</option>`).join("")}</select></div>
        <div class="f"><label for="ct-product">Sản phẩm quan tâm</label><select id="ct-product" name="product"><option value="">Chưa chọn</option>${P.map(p => `<option>${esc(p.name)}</option>`).join("")}</select></div>
        <div class="f full"><label for="ct-msg">Nội dung <i>*</i></label><textarea id="ct-msg" name="message" required maxlength="1500" placeholder="Bạn cần hỗ trợ điều gì?"></textarea><span class="msg"></span></div>
        <div class="f full"><label class="consent"><input type="checkbox" name="consent" id="ct-consent"><span>${esc(K.consent || "Tôi đồng ý để Công ty sử dụng thông tin trên để liên hệ phản hồi yêu cầu này.")}</span></label><span class="msg"></span></div>
      </div>
      <button class="btn btn-ink" type="submit" id="ct-submit">Gửi lời nhắn ${arrow}</button>
    </form>`;
  }

  function faq(){
    const list = (K.faq || []).filter(q => q && q[0] && q[1]);
    if (!list.length) return "";
    return `<section class="cfaq">
      <div class="sec-head reveal"><div><div class="eyebrow">Hỏi &amp; đáp</div><h2>Câu hỏi <em>thường gặp</em></h2></div></div>
      <div class="acc glass">${list.map(([q, a], i) => `<details${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><div class="ac-body"><p>${esc(a).replace(/\n/g, "<br>")}</p></div></details>`).join("")}</div>
    </section>`;
  }

  function render(){
    const root = $("#lienhe-root");
    root.innerHTML = `
      <section class="nhero chero">
        <div class="nwrap">
          <div>
            <div class="eyebrow reveal">${esc(K.eyebrow || "Liên hệ")}</div>
            <h1 class="reveal">${emph(K.title || "Liên hệ *với chúng tôi*")}</h1>
            ${K.lead ? `<p class="reveal">${esc(K.lead)}</p>` : ""}
          </div>
          <div class="pearl" aria-hidden="true"><div class="orbit"><i></i></div><div class="orbit o2"><i></i></div></div>
        </div>
      </section>
      <div class="nwrap">
        <div class="chans">${channels()}</div>
        <div class="cgrid" id="ct-main">${form()}${info()}</div>
        ${faq()}
        <p class="disc-line">Thực phẩm này không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.</p>
      </div>`;
    bind();
    document.title = "Liên hệ · " + (C.brand || "");
    window.NMN.ld({
      "@context": "https://schema.org", "@type": "ContactPage", url: location.href,
      mainEntity: { "@type": "Organization", name: CO.name || C.shopName || C.brand, taxID: CO.taxCode || undefined,
        telephone: C.phone || CO.phone || undefined, email: email || undefined,
        address: address ? { "@type": "PostalAddress", streetAddress: address, addressCountry: "VN" } : undefined }
    });
  }

  function bind(){
    const f = $("#ct-form");
    f.addEventListener("input", e => { const box = e.target.closest(".f"); if (box && box.classList.contains("err")){ box.classList.remove("err"); box.querySelector(".msg").textContent = ""; } });
    f.addEventListener("change", e => { if (e.target.id === "ct-consent") { const box = e.target.closest(".f"); box.classList.remove("err"); box.querySelector(".msg").textContent = ""; } });
    f.addEventListener("submit", e => { e.preventDefault(); submit(f); });
  }

  function err(id, msg){ const box = $("#" + id).closest(".f"); box.classList.add("err"); box.querySelector(".msg").textContent = msg; return box; }

  async function submit(f){
    const d = Object.fromEntries(new FormData(f).entries());
    d.name = (d.name || "").trim(); d.message = (d.message || "").trim(); d.email = (d.email || "").trim();
    const phone = tel(d.phone);
    const bad = [];
    if (d.name.length < 2) bad.push(err("ct-name", "Vui lòng nhập họ tên"));
    if (!/^(\+?84|0)\d{8,10}$/.test(phone)) bad.push(err("ct-phone", "Số điện thoại chưa đúng"));
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) bad.push(err("ct-email", "Email chưa đúng"));
    if (d.message.length < 5) bad.push(err("ct-msg", "Vui lòng nhập nội dung"));
    if (!d.consent) bad.push(err("ct-consent", "Vui lòng đánh dấu đồng ý để chúng tôi liên hệ lại"));
    if (bad.length){ const el = bad[0].querySelector("input,textarea"); el && el.focus({ preventScroll: true }); bad[0].scrollIntoView({ block: "center", behavior: "smooth" }); return; }

    const btn = $("#ct-submit"); btn.disabled = true; btn.textContent = "Đang gửi…";
    const now = new Date();
    const msg = {
      type: "contact", code: "LH-" + now.toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(),
      createdAt: now.toISOString(), name: d.name, phone, email: d.email, topic: d.topic || "", product: d.product || "", message: d.message, page: location.href, sent: false
    };
    if (K.formEndpoint){
      try {
        await fetch(K.formEndpoint, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(msg) });
        msg.sent = true;
      } catch (_) { msg.sent = false; }
    }
    last = msg;
    done();
  }

  function text(m){
    return [`LỜI NHẮN ${m.code}`, `Họ tên: ${m.name}`, `Điện thoại: ${m.phone}`, m.email && `Email: ${m.email}`,
      m.topic && `Chủ đề: ${m.topic}`, m.product && `Sản phẩm quan tâm: ${m.product}`, "", m.message].filter(x => x !== undefined && x !== "" || x === "").filter((x, i, a) => x || a[i - 1]).join("\n");
  }

  function done(){
    const m = last, t = text(m), box = $("#ct-main");
    const mail = email ? `mailto:${email}?subject=${encodeURIComponent("Liên hệ " + m.code + (m.topic ? " · " + m.topic : ""))}&body=${encodeURIComponent(t)}` : "";
    box.innerHTML = `<div class="done cdone">
      <div class="ok">${I.ok}</div>
      <h2>${m.sent ? "Đã gửi lời nhắn" : "Lời nhắn đã sẵn sàng"}</h2>
      <p>${m.sent ? `Cảm ơn ${esc(m.name)}! Chúng tôi đã nhận được lời nhắn và sẽ liên hệ lại qua số <b>${esc(nicePhone(m.phone))}</b>.`
        : `Cảm ơn ${esc(m.name)}! Bấm <b>Gửi qua Zalo</b> (nội dung được chép sẵn, chỉ cần dán) hoặc gửi email để chúng tôi nhận được lời nhắn.`}</p>
      <div class="code">${esc(m.code)}</div>
      <div class="box glass">
        <h3>Nội dung lời nhắn</h3>
        <textarea id="ct-text" readonly>${esc(t)}</textarea>
        <div class="btns">
          ${C.zalo ? `<button class="btn btn-ink" data-ct-zalo>Gửi qua Zalo ${arrow}</button>` : ""}
          ${mail ? `<a class="btn btn-line" href="${esc(mail)}">Gửi qua email</a>` : ""}
          ${C.phone ? `<a class="btn btn-line" href="tel:${esc(tel(C.phone))}">Gọi ${esc(nicePhone(C.phone))}</a>` : ""}
        </div>
      </div>
      <p class="fine"><a href="#lien-he" data-ct-new>Gửi lời nhắn khác</a></p>
    </div>`;
    box.classList.add("is-done");
    box.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  async function copy(t){
    try { if (navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(t); return true; } } catch (_) {}
    const ta = $("#ct-text"); if (ta){ ta.focus(); ta.select(); try { return document.execCommand("copy"); } catch (_) {} }
    return false;
  }
  function toast(msg){ const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600); }

  document.addEventListener("click", async e => {
    if (e.target.closest("[data-ct-zalo]")){
      const ok = await copy($("#ct-text").value);
      toast(ok ? "Đã chép lời nhắn — dán vào khung chat Zalo" : "Hãy sao chép nội dung rồi dán vào Zalo");
      window.open(zaloUrl, "_blank", "noopener");
    } else if (e.target.closest("[data-ct-new]")){
      e.preventDefault(); const box = $("#ct-main"); box.classList.remove("is-done"); box.innerHTML = form() + info(); bind();
    }
  });

  return {
    match: h => h === "lien-he",
    render(){ render(); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }
  };
})();

/* ---------- UI ---------- */
(function(){
  const C = window.CONFIG, POSTS = window.POSTS, EVENTS = window.EVENTS;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const zaloUrl = "https://zalo.me/" + encodeURIComponent(C.zalo);

  /* config → page */
  $$("[data-brand]").forEach(el => { el.textContent = C.brand; const s = document.createElement("small"); s.textContent = C.brandTagline; el.append(s); });
  $$("[data-price]").forEach(el => el.textContent = window.SHOP.priceOf(el.dataset.price));
  $$("[data-price-note]").forEach(el => el.textContent = C.priceNote);
  $$("[data-shop-name]").forEach(el => el.textContent = "© " + new Date().getFullYear() + " " + C.shopName);
  $$('[data-link="phone"]').forEach(el => el.href = "tel:" + C.phone.replace(/\s+/g, ""));
  $$('[data-link="zalo"]').forEach(el => { el.href = zaloUrl; el.target = "_blank"; el.rel = "noopener"; });

  /* split headings into words (keeps Vietnamese words intact) */
  function split(el){
    [...el.childNodes].forEach(n => {
      if (n.nodeType === 3){
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)){ frag.appendChild(document.createTextNode(" ")); return; }
          const o = document.createElement("span"); o.className = "w";
          const i = document.createElement("span"); i.textContent = part;
          o.appendChild(i); frag.appendChild(o);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== "BR") split(n);
    });
  }
  $$(".split").forEach(el => { split(el); el.querySelectorAll(".w > span").forEach((s, i) => s.style.transitionDelay = (i * .05) + "s"); });

  /* reveal on scroll */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12, rootMargin: "0px 0px -5% 0px" });
  const observe = () => $$(".reveal:not(.in), .split:not(.in), .chart:not(.in)").forEach(el => io.observe(el));
  observe();

  /* ---------- header / progress / active links ---------- */
  const header = $("#top"), bar = $("#progress");
  const homeLinks = $$("nav.main a, .side a, .menu a.m").filter(a => (a.getAttribute("href") || "").startsWith("#") && !["#tin-tuc", "#cua-hang", "#lien-he"].includes(a.getAttribute("href")));
  const newsLinks = $$('nav.main a[href="#tin-tuc"], .menu a.m[href="#tin-tuc"]');
  const shopLinks = $$('nav.main a[href="#cua-hang"], .menu a.m[href="#cua-hang"]');
  const contactLinks = $$('nav.main a[href="#lien-he"], .menu a.m[href="#lien-he"]');
  let ticking = false;
  function ui(){
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = "scaleX(" + (max > 0 ? Math.min(scrollY / max, 1) : 0) + ")";
    header.classList.toggle("solid", scrollY > 30 || view !== "home");
    if (view === "home"){
      const mid = scrollY + innerHeight * .45;
      homeLinks.forEach(a => {
        const s = document.getElementById(a.getAttribute("href").slice(1));
        a.classList.toggle("active", !!s && s.offsetTop <= mid && s.offsetTop + s.offsetHeight > mid);
      });
    }
  }
  addEventListener("scroll", () => { if (!ticking){ ticking = true; requestAnimationFrame(ui); } }, { passive: true });
  addEventListener("resize", () => requestAnimationFrame(ui));

  /* ---------- mobile menu ---------- */
  const burger = $("#burger"), menu = $("#menu");
  function setMenu(open){
    document.body.classList.toggle("menu-open", open);
    document.body.classList.toggle("lock", open || reader.classList.contains("open"));
    burger.setAttribute("aria-expanded", open); burger.setAttribute("aria-label", open ? "Đóng menu" : "Mở menu");
    menu.setAttribute("aria-hidden", !open);
    menu.querySelectorAll("a.m").forEach((a, i) => a.style.transitionDelay = open ? (i * .04 + .05) + "s" : "0s");
  }
  burger.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
  menu.addEventListener("click", e => { if (e.target.closest("a")) setMenu(false); });
  addEventListener("resize", () => { if (innerWidth > 1180 && document.body.classList.contains("menu-open")) setMenu(false); });

  /* =====================================================================
     NEWS VIEW
     ===================================================================== */
  const TYPES = {
    "kien-thuc":  { label: "Kiến thức",  cv: "linear-gradient(140deg,#fbf3e3 0%,#ecdcbe 55%,#d9bf8f 100%)", ink: "#a3804c", art: "orb" },
    "nghien-cuu": { label: "Nghiên cứu", cv: "linear-gradient(140deg,#e3eff0 0%,#b9d3d4 55%,#6f9fa1 100%)", ink: "#2c6a6d", art: "helix" },
    "tin-tuc":    { label: "Tin tức",    cv: "linear-gradient(140deg,#24394a 0%,#18283a 60%,#0f1b26 100%)", ink: "#c8a66f", art: "bottle" },
    "su-kien":    { label: "Sự kiện",    cv: "linear-gradient(140deg,#f6e3e6 0%,#e2b9c1 55%,#a7647a 100%)", ink: "#8f4357", art: "rings" }
  };
  const MONTHS = ["Th1","Th2","Th3","Th4","Th5","Th6","Th7","Th8","Th9","Th10","Th11","Th12"];
  const WEEKDAYS = ["Chủ nhật","Thứ hai","Thứ ba","Thứ tư","Thứ năm","Thứ sáu","Thứ bảy"];
  const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  const stripTags = s => String(s).replace(/<[^>]+>/g, " ");
  const parseDate = d => { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd); };
  const fmtDate = d => { const x = parseDate(d); return `${x.getDate()} ${MONTHS[x.getMonth()]}, ${x.getFullYear()}`; };
  const today = (() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); })();
  const arrow = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8h13M9 3l5 5-5 5" stroke="currentColor" fill="none" stroke-width="1.4"/></svg>';

  function art(kind, ink, seed){
    const r = n => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 * n; };
    let g = "";
    if (kind === "orb"){
      const cx = 420 + r(60), cy = 150 + r(40);
      g = `<circle cx="${cx}" cy="${cy}" r="110" fill="url(#pearl)"/><circle cx="${cx}" cy="${cy}" r="38" fill="${ink}" opacity=".55"/>
        <ellipse cx="${cx}" cy="${cy}" rx="170" ry="48" fill="none" stroke="${ink}" stroke-opacity=".4" transform="rotate(-18 ${cx} ${cy})"/>
        <ellipse cx="${cx}" cy="${cy}" rx="150" ry="70" fill="none" stroke="${ink}" stroke-opacity=".25" transform="rotate(28 ${cx} ${cy})"/>
        <circle cx="${cx - 150}" cy="${cy + 40}" r="7" fill="${ink}"/><circle cx="${cx + 140}" cy="${cy - 70}" r="5" fill="${ink}" opacity=".7"/>`;
    } else if (kind === "helix"){
      let a = "", b = "", rungs = "";
      for (let x = 0; x <= 640; x += 8){ const y1 = 160 + Math.sin(x / 48) * 70, y2 = 160 - Math.sin(x / 48) * 70; a += (x ? "L" : "M") + x + " " + y1.toFixed(1); b += (x ? "L" : "M") + x + " " + y2.toFixed(1); }
      for (let x = 12; x < 640; x += 24){ const y1 = 160 + Math.sin(x / 48) * 70, y2 = 160 - Math.sin(x / 48) * 70; rungs += `<line x1="${x}" y1="${y1.toFixed(1)}" x2="${x}" y2="${y2.toFixed(1)}" stroke="#fff" stroke-opacity=".55"/><circle cx="${x}" cy="${y1.toFixed(1)}" r="5" fill="${ink}"/><circle cx="${x}" cy="${y2.toFixed(1)}" r="5" fill="#fff"/>`; }
      g = `<g transform="rotate(-12 320 160)">${rungs}<path d="${a}" fill="none" stroke="${ink}" stroke-width="3"/><path d="${b}" fill="none" stroke="#fff" stroke-width="3" stroke-opacity=".9"/></g>`;
    } else if (kind === "bottle"){
      const bx = 400 + r(40);
      g = `<ellipse cx="${bx + 40}" cy="292" rx="120" ry="14" fill="#000" opacity=".35"/>
        <rect x="${bx - 30}" y="96" width="140" height="196" rx="22" fill="url(#glassG)"/>
        <rect x="${bx - 30}" y="150" width="140" height="92" fill="#fbf7ef" opacity=".95"/>
        <text x="${bx + 40}" y="190" text-anchor="middle" font-family="Noto Serif Display, Georgia, serif" font-weight="600" font-size="22" fill="#13202a">NMN</text>
        <rect x="${bx + 20}" y="204" width="40" height="1.5" fill="${ink}"/>
        <rect x="${bx + 2}" y="56" width="76" height="44" rx="8" fill="${ink}"/>
        <circle cx="140" cy="90" r="2" fill="${ink}"/><circle cx="210" cy="240" r="3" fill="${ink}" opacity=".6"/>`;
    } else {
      g = `<circle cx="470" cy="160" r="60" fill="url(#pearl)"/>` +
        [90, 130, 175].map((rr, i) => `<circle cx="470" cy="160" r="${rr}" fill="none" stroke="${ink}" stroke-opacity="${(.45 - i * .12).toFixed(2)}" stroke-dasharray="${i ? "2 8" : "0"}"/>`).join("") +
        `<circle cx="380" cy="100" r="7" fill="${ink}"/><circle cx="580" cy="230" r="6" fill="#fff"/>`;
    }
    return `<svg class="art" viewBox="0 0 640 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${g}</svg>`;
  }
  function cover(item, type){
    const T = TYPES[type];
    const seed = [...item.slug].reduce((a, c) => a + c.charCodeAt(0), 0);
    const media = item.image ? `<img src="${esc(window.NMN.img(item.image))}" alt="" loading="lazy" decoding="async">` : art(T.art, T.ink, seed);
    return `<div class="cover" style="--cv:${T.cv}">${media}<span class="badge">${T.label}</span>${item.sample ? '<span class="sample">Mẫu</span>' : ""}</div>`;
  }

  const posts = POSTS.slice().sort((a, b) => b.date.localeCompare(a.date));
  const events = EVENTS.slice().sort((a, b) => {
    const pa = parseDate(a.date) < today, pb = parseDate(b.date) < today;
    if (pa !== pb) return pa ? 1 : -1;
    return pa ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  });
  const state = { tab: "all", q: "", shown: C.postsPerPage };
  const tabDefs = [["all", "Tất cả"], ["kien-thuc", "Kiến thức"], ["nghien-cuu", "Nghiên cứu"], ["tin-tuc", "Tin tức"], ["su-kien", "Sự kiện"]];
  const countFor = id => id === "all" ? posts.length + events.length : id === "su-kien" ? events.length : posts.filter(p => p.type === id).length;
  $("#n-tabs").innerHTML = tabDefs.map(([id, l]) => `<button class="tab${id === "all" ? " on" : ""}" role="tab" aria-selected="${id === "all"}" data-tab="${id}">${l}<span class="c">${countFor(id)}</span></button>`).join("");
  $("#n-tabs").addEventListener("click", e => {
    const b = e.target.closest(".tab"); if (!b) return;
    state.tab = b.dataset.tab; state.shown = C.postsPerPage;
    $$(".tab").forEach(t => { t.classList.toggle("on", t === b); t.setAttribute("aria-selected", t === b); });
    b.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    renderNews();
  });
  let qTimer;
  $("#n-q").addEventListener("input", e => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value.trim(); state.shown = C.postsPerPage; renderNews(); }, 150); });
  $("#n-more").addEventListener("click", () => { state.shown += C.postsPerPage; renderNews(); });
  const matches = (item, text) => !state.q || fold(item.title + " " + stripTags(text)).includes(fold(state.q));

  const icon = {
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    seat: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14a6.5 6.5 0 0 1 3 6"/></svg>'
  };
  function eventStatus(ev){
    const diff = Math.round((parseDate(ev.date) - today) / 864e5);
    if (diff < 0) return { past: true, html: '<span class="pill past">Đã diễn ra</span>' };
    if (diff === 0) return { past: false, html: '<span class="pill up">Hôm nay</span>' };
    return { past: false, html: `<span class="pill up">Còn ${diff} ngày</span>` };
  }

  function renderNews(){
    const showPosts = state.tab !== "su-kien", showEvents = state.tab === "all" || state.tab === "su-kien";
    const feat = posts.find(p => p.featured), showFeat = !!feat && state.tab === "all" && !state.q;
    const F = $("#n-featured"); F.hidden = !showFeat;
    if (showFeat){
      F.dataset.open = "bai/" + feat.slug;
      F.innerHTML = `${cover(feat, feat.type)}<div class="body">
        <span class="flag"><i></i>Bài nổi bật</span>
        <h2>${esc(feat.title)}</h2><p>${esc(feat.excerpt)}</p>
        <div class="info"><span>${fmtDate(feat.date)}</span><span>${feat.read} phút đọc</span></div>
        <div><span class="btn btn-ink">Đọc bài viết ${arrow}</span></div></div>`;
    }
    const evs = events.filter(e => matches(e, e.place + " " + e.city + " " + e.desc));
    $("#n-events-block").hidden = !showEvents || (!evs.length && state.tab !== "su-kien");
    $("#n-events").innerHTML = evs.length ? evs.map(ev => {
      const d = parseDate(ev.date), st = eventStatus(ev), key = "su-kien/" + esc(ev.slug);
      return `<div class="event glass${st.past ? " past" : ""}">
        <div class="date"><b>${String(d.getDate()).padStart(2, "0")}</b><span>${MONTHS[d.getMonth()]}</span><small>${d.getFullYear()}</small></div>
        <div style="min-width:0">
          <div class="pills">${st.html}${ev.sample ? '<span class="pill sample">Mẫu</span>' : ""}</div>
          <h3 data-open="${key}">${esc(ev.title)}</h3>
          <div class="meta">
            <span>${icon.clock}${WEEKDAYS[d.getDay()]}, ${esc(ev.time)}</span>
            <span>${icon.pin}${esc(ev.place)}${ev.city ? " · " + esc(ev.city) : ""}</span>
            ${ev.seats ? `<span>${icon.seat}${esc(ev.seats)}</span>` : ""}
          </div>
        </div>
        <div class="act">
          ${st.past ? `<button class="btn btn-line btn-sm" data-open="${key}">Xem lại</button>`
                    : `<a class="btn btn-ink btn-sm" href="${esc(ev.registerUrl || zaloUrl)}" target="_blank" rel="noopener">Đăng ký</a>`}
          <a class="link" href="#${key}" data-open="${key}">Chi tiết</a>
        </div></div>`;
    }).join("") : `<div class="empty"><b>Chưa có sự kiện phù hợp</b>Hãy thử từ khoá khác.</div>`;

    $("#n-posts-block").hidden = !showPosts;
    if (showPosts){
      let list = posts.filter(p => (state.tab === "all" || p.type === state.tab) && matches(p, p.excerpt + " " + p.body));
      if (showFeat) list = list.filter(p => p !== feat);
      const tabName = tabDefs.find(t => t[0] === state.tab)[1];
      $("#n-posts-title").innerHTML = state.q ? `Kết quả cho “${esc(state.q)}”` : state.tab === "all" ? "Mới nhất" : esc(tabName);
      $("#n-grid").innerHTML = list.length ? list.slice(0, state.shown).map(p => `
        <article class="card glass" data-open="bai/${esc(p.slug)}" tabindex="0">
          ${cover(p, p.type)}
          <div class="body"><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p>
            <div class="info"><span>${fmtDate(p.date)}</span><span>${p.read} phút đọc</span></div></div>
        </article>`).join("") : `<div class="empty"><b>Không tìm thấy bài viết</b>Hãy thử từ khoá hoặc chuyên mục khác.</div>`;
      $("#n-more").hidden = list.length <= state.shown;
    }
    observe();
  }

  /* ---------- reader ---------- */
  const reader = $("#reader"), sheet = $("#sheet");
  let lastFocus = null;
  function footerHtml(register, url){
    return `<div class="sheet-foot">
      <button class="btn btn-line btn-sm" data-share>Sao chép liên kết</button>
      <a class="btn btn-ink btn-sm" href="${esc(url || zaloUrl)}" target="_blank" rel="noopener">${register ? (url ? "Đăng ký tham gia" : "Đăng ký qua Zalo") : "Nhận tư vấn"}</a></div>`;
  }
  function openItem(key){
    const [kind, slug] = key.split("/");
    let html = "", title = "";
    if (kind === "bai"){
      const p = posts.find(x => x.slug === slug); if (!p) return false;
      title = p.title;
      html = `${cover(p, p.type)}<div class="inner">
        <span class="flag"><i></i>${TYPES[p.type].label}</span>
        <h1 id="r-title">${esc(p.title)}</h1>
        <div class="info"><span>${fmtDate(p.date)}</span><span>${p.read} phút đọc</span></div>
        <div class="prose">${window.NMN.imgHtml(p.body)}</div>${footerHtml(false)}</div>`;
      window.NMN.ld({ "@context": "https://schema.org", "@type": "Article", headline: p.title, description: p.excerpt,
        datePublished: p.date, image: window.NMN.abs(p.image), publisher: { "@type": "Organization", name: C.shopName || C.brand } });
    } else if (kind === "su-kien"){
      const ev = events.find(x => x.slug === slug); if (!ev) return false;
      const d = parseDate(ev.date), st = eventStatus(ev);
      title = ev.title;
      html = `${cover(ev, "su-kien")}<div class="inner">
        <span class="flag" style="color:var(--rose)"><i></i>Sự kiện</span>
        <h1 id="r-title">${esc(ev.title)}</h1>
        <div class="info">${st.html}<span>${WEEKDAYS[d.getDay()]}, ${fmtDate(ev.date)}</span><span>${esc(ev.time)}</span><span>${esc(ev.place)}${ev.city ? " · " + esc(ev.city) : ""}</span>${ev.seats ? `<span>${esc(ev.seats)}</span>` : ""}</div>
        <div class="prose">${window.NMN.imgHtml(ev.desc)}</div>${footerHtml(!st.past, ev.registerUrl)}</div>`;
      window.NMN.ld({ "@context": "https://schema.org", "@type": "Event", name: ev.title, startDate: ev.date,
        location: { "@type": "Place", name: ev.place, address: ev.city }, image: window.NMN.abs(ev.image),
        organizer: { "@type": "Organization", name: C.shopName || C.brand } });
    } else return false;
    sheet.innerHTML = html;
    if (!reader.classList.contains("open")) lastFocus = document.activeElement;
    reader.classList.add("open"); reader.scrollTop = 0; document.body.classList.add("lock");
    document.title = title + " · Tin tức";
    $("#r-close").focus({ preventScroll: true });
    return true;
  }
  function closeReader(){
    if (!reader.classList.contains("open")) return;
    reader.classList.remove("open");
    document.body.classList.toggle("lock", document.body.classList.contains("menu-open"));
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  $("#r-close").addEventListener("click", () => history.pushState(null, "", "#tin-tuc") || route());
  reader.addEventListener("click", e => { if (e.target === reader) { history.pushState(null, "", "#tin-tuc"); route(); } });
  document.addEventListener("click", e => {
    if (e.target.closest("[data-share]")) { copyLink(); return; }
    const t = e.target.closest("[data-open]");
    if (t && !e.target.closest('a[target="_blank"]')){ e.preventDefault(); history.pushState(null, "", "#" + t.dataset.open); route(); }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape"){
      if (reader.classList.contains("open")) { history.pushState(null, "", "#tin-tuc"); route(); }
      else if (document.body.classList.contains("menu-open")) setMenu(false);
    }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".card[data-open]")) { e.preventDefault(); e.target.click(); }
  });
  function copyLink(){
    const url = location.href;
    try {
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(() => toast("Đã sao chép liên kết"), () => toast(url));
      else toast(url);
    } catch (_) { toast(url); }
  }
  let toastTimer;
  function toast(msg){ const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2400); }

  /* =====================================================================
     ROUTER — "#tin-tuc", "#bai/<slug>", "#su-kien/<slug>" → news view; anything else → home
     ===================================================================== */
  let view = "home";
  const homeEl = $("#home"), newsEl = $("#news"), shopEl = $("#shop"), contactEl = $("#lienhe");
  function setView(v){
    if (v === view) return false;
    if (view === "shop") window.SHOP.leave();
    view = v;
    document.body.dataset.view = v;
    homeEl.hidden = v !== "home"; newsEl.hidden = v !== "news"; shopEl.hidden = v !== "shop"; contactEl.hidden = v !== "contact";
    newsLinks.forEach(a => a.classList.toggle("active", v === "news"));
    shopLinks.forEach(a => a.classList.toggle("active", v === "shop"));
    contactLinks.forEach(a => a.classList.toggle("active", v === "contact"));
    if (v !== "home") homeLinks.forEach(a => a.classList.remove("active"));
    window.dispatchEvent(new CustomEvent("viewchange", { detail: v }));
    return true;
  }
  function jumpTo(y){ window.scrollTo({ top: y, left: 0, behavior: "instant" }); }
  function route(){
    const h = decodeURIComponent(location.hash.slice(1));
    const isItem = /^(bai|su-kien)\//.test(h);
    if (h === "tin-tuc" || isItem){
      const changed = setView("news");
      if (changed){ renderNews(); jumpTo(0); $("#loader").classList.add("hide"); }
      if (isItem){ if (!openItem(h)) { history.replaceState(null, "", "#tin-tuc"); closeReader(); } }
      else { closeReader(); document.title = "Tin tức & Sự kiện · " + C.brand; }
    } else if (window.CONTACT.match(h)){
      closeReader();
      setView("contact");
      $("#loader").classList.add("hide");
      window.CONTACT.render();
      observe();
    } else if (window.SHOP.match(h)){
      closeReader();
      setView("shop");
      $("#loader").classList.add("hide");
      window.SHOP.render(h);
    } else {
      closeReader();
      const changed = setView("home");
      document.title = (C.seo && C.seo.title) || C.brand;
      window.NMN.ld();
      if (changed){
        const target = h && document.getElementById(h);
        requestAnimationFrame(() => jumpTo(target ? target.getBoundingClientRect().top + scrollY : 0));
      }
    }
    ui();
  }
  addEventListener("hashchange", route);
  addEventListener("popstate", route);
  renderNews();
  route();

  /* never leave the loader up (e.g. 3D blocked or very slow network) */
  setTimeout(() => $("#loader").classList.add("hide"), 4500);
})();
})();
