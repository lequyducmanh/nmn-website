/* =====================================================================
   VN ADDRESS — chọn địa chỉ theo đơn vị hành chính mới (2 cấp: Tỉnh/Thành phố → Phường/Xã/Đặc khu)
   • Dữ liệu: assets/data/vn-units.json  (34 tỉnh/thành, 3.321 phường/xã/đặc khu)
             nguồn ThangLeQuoc/vietnamese-provinces-database (MIT)
   • Tra địa chỉ cũ → mới: assets/data/vn-old-wards.json (tải khi cần)
             nguồn quangtam/vietnam-address-database (MIT)
   • Tìm không dấu, gõ tắt (hcm, hn, sg…), gõ tên tỉnh cũ (Bình Dương → TP Hồ Chí Minh).
   API: VNAddress.mount(el, { value, onChange }) → { get(), validate(), focusFirstError() }
   ===================================================================== */
window.VNAddress = (function(){
  const VER = "20261027";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const UNIT = /^(thanh pho|tinh|phuong|xa|dac khu|thi tran|quan|huyen|thi xa|tp)\s+/;
  const bare = s => norm(s).replace(UNIT, "");
  const short = s => String(s).replace(/^(Thành phố|Tỉnh)\s+/, "");
  const ALIAS = { "79": ["hcm", "tphcm", "tp hcm", "ho chi minh", "sai gon", "saigon", "sg"], "01": ["hn", "ha noi", "hanoi"], "48": ["dn", "da nang"], "31": ["hp", "hai phong"], "92": ["ct", "can tho"] };

  let units = null, unitsP = null, old = null, oldP = null;
  function loadUnits(){
    if (units) return Promise.resolve(units);
    return unitsP || (unitsP = fetch("assets/data/vn-units.json?v=" + VER).then(r => { if (!r.ok) throw 0; return r.json(); }).then(d => {
      const P = d.p.map(([code, name, wards, olds]) => ({
        code, name, short: short(name),
        key: [bare(name), ...(ALIAS[code] || []), ...(olds || []).map(norm)].join(" | "),
        olds: olds || [],
        wards: wards.map(([wc, wn]) => ({ code: wc, name: wn, key: norm(wn), b: bare(wn) }))
      }));
      const byWard = {}; P.forEach(p => p.wards.forEach(w => byWard[w.code] = { p, w }));
      units = { meta: d, P, byCode: Object.fromEntries(P.map(p => [p.code, p])), byWard };
      return units;
    }).catch(e => { unitsP = null; throw e; }));
  }
  function loadOld(){
    if (old) return Promise.resolve(old);
    return oldP || (oldP = Promise.all([loadUnits(), fetch("assets/data/vn-old-wards.json?v=" + VER).then(r => { if (!r.ok) throw 0; return r.json(); })]).then(([, d]) => {
      const D = d.d.map(s => { const [dist, prov] = s.split("|"); return { dist, prov, key: norm(dist + " " + prov) }; });
      D.forEach(x => { x.b = bare(x.dist); x.pb = bare(x.prov); });
      old = d.m.map(([wn, di, nc], i) => ({ i, wn, d: D[di], nc, b: bare(wn), words: (norm(wn) + " " + D[di].key).split(" ") }));
      return old;
    }).catch(e => { oldP = null; throw e; }));
  }

  /* token match: every query token is a prefix of some word (numbers must match whole word) */
  function tokMatch(words, toks){ return toks.every(t => /^\d+$/.test(t) ? words.includes(t) : words.some(w => w.startsWith(t))); }
  function rank(item, q, toks){
    const k = item.b !== undefined ? item.b : bare(item.name);
    if (k === q) return 0;
    if (k.startsWith(q)) return 1;
    const words = (item.key || "").split(/[\s|]+/);
    if (tokMatch(k.split(" "), toks)) return 2;
    if (tokMatch(words, toks)) return 3;
    return -1;
  }

  /* ---------- combobox ---------- */
  let uid = 0;
  function combo(box, { items, label, placeholder, onPick, empty, extra }){
    const id = "vna" + (++uid);
    box.innerHTML = `<div class="cb">
        <input id="${id}" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-l" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(placeholder)}">
        <button type="button" class="cb-t" tabindex="-1" aria-label="Mở danh sách ${esc(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <ul class="cb-l" id="${id}-l" role="listbox" aria-label="${esc(label)}" hidden></ul>
      </div>`;
    const inp = box.querySelector("input"), list = box.querySelector("ul"), tog = box.querySelector(".cb-t");
    let sel = null, shown = [], act = -1, src = items;
    const lift = on => { const c = box.closest(".fs, .glass"); if (c) c.classList.toggle("cb-up", on); };
    const open = () => { list.hidden = false; inp.setAttribute("aria-expanded", "true"); box.classList.add("open"); lift(true); };
    const close = () => { list.hidden = true; inp.setAttribute("aria-expanded", "false"); box.classList.remove("open"); lift(false); inp.removeAttribute("aria-activedescendant"); act = -1; };
    function paint(q = ""){
      const nq = norm(q), bq = bare(q) || nq, toks = bq ? bq.split(" ") : [];
      shown = !nq ? src.slice() : src.map(it => [it, rank(it, bq, toks)]).filter(x => x[1] >= 0).sort((a, b) => a[1] - b[1]).map(x => x[0]);
      const via = it => nq && it.olds && it.olds.length && !tokMatch(bare(it.name).split(" "), toks) && it.olds.find(o => tokMatch(norm(o).split(" "), toks));
      list.innerHTML = shown.length
        ? shown.slice(0, 300).map((it, i) => { const v = via(it); return `<li role="option" id="${id}-o${i}" data-i="${i}" aria-selected="${sel === it}">${esc(it.name)}${v ? `<small>gồm ${esc(v)} cũ</small>` : ""}</li>`; }).join("")
        : `<li class="cb-none" aria-disabled="true">${empty ? empty(q) : "Không tìm thấy"}</li>`;
      if (extra) list.insertAdjacentHTML("beforeend", extra(q, shown.length));
      act = -1; open();
    }
    function hi(i){
      const opts = list.querySelectorAll("[role=option]"); if (!opts.length) return;
      act = (i + opts.length) % opts.length;
      opts.forEach((o, j) => o.classList.toggle("act", j === act));
      inp.setAttribute("aria-activedescendant", opts[act].id); opts[act].scrollIntoView({ block: "nearest" });
    }
    function pick(it, silent){
      sel = it || null; inp.value = it ? it.name : ""; close();
      box.closest(".f")?.classList.remove("err"); const m = box.closest(".f")?.querySelector(".msg"); if (m) m.textContent = "";
      if (!silent) onPick(sel);
    }
    inp.addEventListener("focus", () => {
      inp.select(); paint("");
      const vh = window.visualViewport ? visualViewport.height : innerHeight, r = inp.getBoundingClientRect();
      const top = (box.closest(".f") || inp).getBoundingClientRect().top;
      const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 70;
      if (r.bottom + Math.min(300, vh * .46) > vh || top < head) window.scrollBy({ top: top - head - 14, behavior: "smooth" });
    });
    inp.addEventListener("input", () => paint(inp.value));
    inp.addEventListener("keydown", e => {
      if (e.key === "ArrowDown"){ e.preventDefault(); if (list.hidden) paint(inp.value === (sel && sel.name) ? "" : inp.value); hi(act + 1); }
      else if (e.key === "ArrowUp"){ e.preventDefault(); hi(act - 1); }
      else if (e.key === "Enter"){ if (!list.hidden){ e.preventDefault(); const it = shown[act >= 0 ? act : 0]; if (it && (act >= 0 || shown.length === 1 || inp.value)) pick(it); } }
      else if (e.key === "Escape"){ if (!list.hidden){ e.preventDefault(); e.stopPropagation(); inp.value = sel ? sel.name : ""; close(); } }
      else if (e.key === "Tab"){ if (!list.hidden && inp.value && inp.value !== (sel && sel.name)){ const it = shown[act >= 0 ? act : 0]; if (it && (act >= 0 || shown.length === 1)) pick(it); } }
    });
    inp.addEventListener("blur", () => setTimeout(() => {
      if (box.contains(document.activeElement)) return;
      if (!list.hidden){ const it = inp.value && inp.value !== (sel && sel.name) && shown.length === 1 ? shown[0] : null; if (it) pick(it); else { inp.value = sel ? sel.name : ""; close(); } }
    }, 120));
    list.addEventListener("mousedown", e => e.preventDefault());
    list.addEventListener("click", e => { const li = e.target.closest("[role=option]"); if (li) pick(shown[+li.dataset.i]); });
    tog.addEventListener("mousedown", e => e.preventDefault());
    tog.addEventListener("click", () => { if (inp.disabled) return; if (list.hidden){ if (document.activeElement === inp) paint(""); else inp.focus(); } else close(); });
    return {
      inp, get: () => sel, set: (it) => pick(it, true),
      setItems(arr, ph){ src = arr; sel = null; inp.value = ""; inp.disabled = !arr.length; inp.placeholder = ph; box.classList.toggle("off", !arr.length); close(); },
      close
    };
  }

  function mount(root, { value = {}, onChange = () => {} } = {}){
    root.innerHTML = `
      <div class="fgrid vna">
        <div class="f" data-vna="p"><label>Tỉnh / Thành phố <i>*</i></label><div class="cbw"></div><span class="msg"></span></div>
        <div class="f" data-vna="w"><label>Phường / Xã / Đặc khu <i>*</i></label><div class="cbw"></div><span class="msg"></span></div>
        <div class="f full vna-help">
          <button type="button" class="linkish" data-vna-old aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v3h3"/><path d="M12 8v4l3 2"/></svg>Chỉ nhớ địa chỉ cũ (có quận/huyện)? Tra địa chỉ mới</button>
          <div class="vna-old" hidden>
            <label for="vna-oq">Nhập phường/xã cũ và quận/huyện cũ</label>
            <input id="vna-oq" type="search" autocomplete="off" placeholder="Ví dụ: Phường 12 Gò Vấp, Thổ Quan Đống Đa…">
            <ul class="vna-res" role="listbox" aria-label="Kết quả tra cứu"></ul>
            <p class="fine">Theo dữ liệu sắp xếp đơn vị hành chính từ 01/07/2025. Một phường/xã cũ có thể được chia cho nhiều phường/xã mới — hãy chọn đúng nơi bạn ở; chúng tôi sẽ xác nhận lại khi gọi điện.</p>
          </div>
        </div>
        <div class="f full"><label for="vna-st">Số nhà, tên đường <i>*</i></label><input id="vna-st" name="street" autocomplete="address-line1" maxlength="160" placeholder="Ví dụ: 12 Lê Lợi, tòa nhà A, tầng 5"><span class="msg"></span></div>
        <p class="vna-sum full" aria-live="polite" hidden></p>
      </div>`;
    const fP = root.querySelector('[data-vna="p"]'), fW = root.querySelector('[data-vna="w"]');
    const st = root.querySelector("#vna-st"), sum = root.querySelector(".vna-sum");
    const oldBtn = root.querySelector("[data-vna-old]"), oldBox = root.querySelector(".vna-old"), oq = root.querySelector("#vna-oq"), ores = root.querySelector(".vna-res");
    let U = null, cP, cW;

    const state = () => { const p = cP && cP.get(), w = cW && cW.get(); return { province: p, ward: w, street: st.value.trim() }; };
    function paintSum(){
      const s = state(); const parts = [s.street, s.ward && s.ward.name, s.province && s.province.name].filter(Boolean);
      sum.hidden = parts.length < 2; sum.innerHTML = `<span>Giao đến</span>${esc(parts.join(", "))}`;
      onChange(api.get());
    }
    function setProvince(p, keepWard){
      cW.setItems(p ? p.wards : [], p ? `Gõ để tìm trong ${p.short}…` : "Chọn tỉnh / thành phố trước");
      if (p && !keepWard) setTimeout(() => cW.inp.focus(), 0);
      paintSum();
    }
    function openOld(q){
      oldBox.hidden = false; oldBtn.setAttribute("aria-expanded", "true"); oldBtn.classList.add("on");
      if (q != null) oq.value = q;
      oq.focus(); searchOld();
    }

    let oTimer;
    function searchOld(){
      clearTimeout(oTimer);
      oTimer = setTimeout(async () => {
        // "p12" → "phuong 12", "q1" → "quan 1"; bỏ "tp", "p", "q" đứng riêng
        const nq = norm(oq.value).replace(/\bp\s*(\d+)\b/g, "phuong $1").replace(/\bq\s*(\d+)\b/g, "quan $1").replace(/\b(tp|p|q)\b/g, " ").replace(/\s+/g, " ").trim();
        if (nq.length < 2){ ores.innerHTML = `<li class="cb-none">Gõ ít nhất 2 ký tự.</li>`; return; }
        if (!old){ ores.innerHTML = `<li class="cb-none">Đang tải dữ liệu tra cứu…</li>`; }
        try { await loadOld(); } catch (_) { ores.innerHTML = `<li class="cb-none">Không tải được dữ liệu. Bạn hãy ghi địa chỉ cũ vào ô Ghi chú, chúng tôi sẽ hỗ trợ.</li>`; return; }
        const toks = nq.split(" ");
        const has = x => x && (" " + nq + " ").includes(" " + x + " ");
        const score = r => (has(r.b) ? 6 : 0) + (has(r.d.b) ? 3 : 0) + (has(r.d.pb) ? 1 : 0) + toks.filter(t => r.b.split(" ").some(w => /^\d+$/.test(t) ? w === t : w.startsWith(t))).length;
        const hits = old.filter(r => tokMatch(r.words, toks)).map(r => [r, score(r)]).sort((a, b) => b[1] - a[1] || a[0].i - b[0].i).slice(0, 30).map(x => x[0]);
        ores.innerHTML = hits.length ? hits.map((r, i) => {
          const n = U.byWard[r.nc]; if (!n) return "";
          return `<li role="option" tabindex="0" data-nc="${esc(r.nc)}"><span class="o">${esc(r.wn)} · ${esc(r.d.dist)} · ${esc(short(r.d.prov))}</span><span class="n">→ <b>${esc(n.w.name)}</b>, ${esc(n.p.name)}</span></li>`;
        }).join("") : `<li class="cb-none">Không tìm thấy. Thử gõ ngắn hơn (ví dụ chỉ tên phường và quận), hoặc ghi địa chỉ cũ vào ô Ghi chú.</li>`;
      }, 160);
    }
    oldBtn.addEventListener("click", () => { if (oldBox.hidden) openOld(); else { oldBox.hidden = true; oldBtn.setAttribute("aria-expanded", "false"); oldBtn.classList.remove("on"); } });
    oq.addEventListener("input", searchOld);
    oq.addEventListener("keydown", e => { if (e.key === "ArrowDown"){ const f = ores.querySelector("[data-nc]"); if (f){ e.preventDefault(); f.focus(); } } });
    ores.addEventListener("keydown", e => {
      const li = e.target.closest("[data-nc]"); if (!li) return;
      if (e.key === "Enter" || e.key === " "){ e.preventDefault(); li.click(); }
      else if (e.key === "ArrowDown"){ e.preventDefault(); (li.nextElementSibling || li).focus(); }
      else if (e.key === "ArrowUp"){ e.preventDefault(); (li.previousElementSibling || oq).focus(); }
    });
    ores.addEventListener("click", e => {
      const li = e.target.closest("[data-nc]"); if (!li) return;
      const n = U.byWard[li.dataset.nc]; if (!n) return;
      cP.set(n.p); setProvince(n.p, true); cW.set(n.w);
      fP.classList.remove("err"); fW.classList.remove("err");
      oldBox.hidden = true; oldBtn.setAttribute("aria-expanded", "false"); oldBtn.classList.remove("on");
      paintSum(); st.focus();
      root.dispatchEvent(new CustomEvent("vna:toast", { bubbles: true, detail: `Đã chọn ${n.w.name}, ${n.p.name}` }));
    });
    st.addEventListener("input", () => { root.querySelector("#vna-st").closest(".f").classList.remove("err"); paintSum(); });

    const pBox = fP.querySelector(".cbw"), wBox = fW.querySelector(".cbw");
    pBox.innerHTML = `<div class="cb off"><input type="text" disabled placeholder="Đang tải danh sách…"></div>`;
    wBox.innerHTML = `<div class="cb off"><input type="text" disabled placeholder="Chọn tỉnh / thành phố trước"></div>`;
    st.value = value.street || "";

    const ready = loadUnits().then(u => {
      U = u;
      cP = combo(pBox, { items: u.P, label: "Tỉnh / Thành phố", placeholder: "Gõ để tìm: Hà Nội, HCM, Đà Nẵng…",
        empty: q => `Không có “${esc(q)}”. Từ 2025 cả nước còn 34 tỉnh/thành — thử gõ tên tỉnh cũ, ví dụ “Bình Dương”.`,
        onPick: p => setProvince(p) });
      cW = combo(wBox, { items: [], label: "Phường / Xã / Đặc khu", placeholder: "Chọn tỉnh / thành phố trước",
        empty: q => `Không có “${esc(q)}” trong danh sách mới.`,
        extra: (q, n) => q && n < 3 ? `<li class="cb-more"><button type="button" data-vna-q="${esc(q)}">Đây là tên phường/xã cũ? Tra địa chỉ mới →</button></li>` : "",
        onPick: () => { paintSum(); if (!st.value) setTimeout(() => st.focus(), 0); } });
      cW.setItems([], "Chọn tỉnh / thành phố trước");
      wBox.addEventListener("mousedown", e => { if (e.target.closest("[data-vna-q]")) e.preventDefault(); });
      wBox.addEventListener("click", e => { const b = e.target.closest("[data-vna-q]"); if (b){ cW.close(); openOld(b.dataset.vnaQ); } });
      const p = value.provinceCode && u.byCode[value.provinceCode];
      if (p){ cP.set(p); setProvince(p, true); const w = value.wardCode && p.wards.find(x => x.code === value.wardCode); if (w) cW.set(w); }
      paintSum();
      return u;
    }).catch(() => {
      // fallback: free text if data can't load
      pBox.innerHTML = `<input name="city" autocomplete="address-level1" maxlength="60" placeholder="Tỉnh / Thành phố">`;
      wBox.innerHTML = `<input name="ward" maxlength="80" placeholder="Phường / Xã">`;
      root.querySelector(".vna-help").hidden = true;
    });

    const api = {
      ready,
      get(){
        const s = state();
        if (!U){ const c = (pBox.querySelector("input") || {}).value || "", w = (wBox.querySelector("input") || {}).value || ""; return { provinceCode: "", province: c.trim(), wardCode: "", ward: w.trim(), street: s.street, full: [s.street, w.trim(), c.trim()].filter(Boolean).join(", ") }; }
        return { provinceCode: s.province ? s.province.code : "", province: s.province ? s.province.name : "", wardCode: s.ward ? s.ward.code : "", ward: s.ward ? s.ward.name : "", street: s.street,
          full: [s.street, s.ward && s.ward.name, s.province && s.province.name].filter(Boolean).join(", ") };
      },
      validate(){
        const v = api.get(), bad = [];
        const err = (f, m) => { f.classList.add("err"); f.querySelector(".msg").textContent = m; bad.push(f); };
        if (!v.province) err(fP, "Vui lòng chọn tỉnh / thành phố.");
        if (!v.ward) err(fW, v.province ? "Vui lòng chọn phường / xã trong danh sách." : "Chọn tỉnh / thành phố trước.");
        if (v.street.length < 3) err(st.closest(".f"), "Vui lòng nhập số nhà, tên đường.");
        return bad;
      }
    };
    return api;
  }

  return { mount, load: loadUnits, norm };
})();
