/**
 * Logic thuần (không phụ thuộc Firebase) — dễ kiểm thử.
 * Đơn hàng: kiểm tra dữ liệu, tính lại tiền theo bảng giá.
 * Thanh toán: nhận diện mã chuyển khoản trong nội dung giao dịch, cộng dồn số tiền.
 */
'use strict';

const CODE_RE = /^NMN-\d{6}-[A-Z0-9]{5}$/;
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAXQ = 99, MAX_LINES = 20;

const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const payCode = code => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const phoneOk = p => /^(0|\+?84)(3|5|7|8|9)\d{8}$/.test(p);
const emailOk = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

function newCode(now = new Date(), rand = Math.random){
  const d = new Date(now.getTime() + 7 * 3600e3);   // giờ Việt Nam
  const ymd = String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
  let r = ''; for (let i = 0; i < 5; i++) r += ABC[Math.floor(rand() * ABC.length)];
  return 'NMN-' + ymd + '-' + r;
}

/** Bảng giá từ products.json + site.json của website */
function catalog(products, site){
  const c = { price: {}, name: {}, ship: null, free: null, bank: false };
  (products || []).forEach(p => { if (p && p.slug && p.visible !== false){ c.price[p.slug] = Math.max(0, Math.round(Number(p.price) || 0)); c.name[p.slug] = String(p.name || p.slug); } });
  if (site){
    c.ship = site.shippingFee == null || site.shippingFee === '' ? null : Math.max(0, Number(site.shippingFee) || 0);
    c.free = site.freeShippingFrom == null || site.freeShippingFrom === '' ? null : Math.max(0, Number(site.freeShippingFrom) || 0);
    c.bank = !!(site.bank && site.bank.code && site.bank.account);
  }
  return c;
}

/** Kiểm tra đơn từ trình duyệt; trả { order } (đã làm sạch, tính lại tiền) hoặc { error } */
function buildOrder(body, cat){
  const b = body || {}, cu = b.customer || {};
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return { error: 'Giỏ hàng trống.' };
  if (items.length > MAX_LINES) return { error: 'Quá nhiều sản phẩm trong một đơn.' };
  const lines = [], seen = new Set();
  for (const it of items){
    const slug = str(it && it.slug, 80), qty = parseInt(it && it.qty, 10);
    if (!(slug in cat.price)) return { error: 'Sản phẩm không còn bán: ' + slug };
    if (!(qty >= 1 && qty <= MAXQ)) return { error: 'Số lượng không hợp lệ.' };
    if (seen.has(slug)) return { error: 'Sản phẩm bị lặp.' };
    seen.add(slug);
    lines.push({ slug, name: cat.name[slug], price: cat.price[slug], qty, lineTotal: cat.price[slug] * qty });
  }
  const name = str(cu.name, 80), phone = str(cu.phone, 20).replace(/[\s.\-()]/g, ''), email = str(cu.email, 120);
  if (name.length < 2) return { error: 'Thiếu họ tên.' };
  if (!phoneOk(phone)) return { error: 'Số điện thoại không hợp lệ.' };
  if (!emailOk(email)) return { error: 'Email không hợp lệ.' };
  const province = str(cu.province || cu.city, 80), street = str(cu.street || cu.address, 200);
  if (province.length < 2 || street.length < 3) return { error: 'Thiếu địa chỉ nhận hàng.' };
  const method = b.payment === 'bank' ? 'bank' : 'cod';
  if (method === 'bank' && !cat.bank) return { error: 'Cửa hàng chưa bật chuyển khoản.' };
  const sub = lines.reduce((s, l) => s + l.lineTotal, 0);
  let ship = cat.ship; if (cat.free != null && sub >= cat.free) ship = 0;
  const total = sub + (ship || 0);
  const code = CODE_RE.test(String(b.code || '')) ? String(b.code) : null;
  return { order: {
    code, items: lines, subtotal: sub, shipping: ship, total,
    clientTotal: Number(b.total) || 0,
    customer: {
      name, phone, email,
      province, provinceCode: str(cu.provinceCode, 4), ward: str(cu.ward, 80), wardCode: str(cu.wardCode, 8),
      street, address: str(cu.fullAddress, 320) || [street, str(cu.ward, 80), province].filter(Boolean).join(', '),
      note: str(cu.note, 500)
    },
    payment: { method, state: method === 'bank' ? 'pending' : 'cod', paid: 0 }
  } };
}

function buildContact(body){
  const b = body || {};
  const name = str(b.name, 80), phone = str(b.phone, 20).replace(/[\s.\-()]/g, ''), email = str(b.email, 120), message = str(b.message, 1500);
  if (name.length < 2) return { error: 'Thiếu họ tên.' };
  if (!phoneOk(phone)) return { error: 'Số điện thoại không hợp lệ.' };
  if (!emailOk(email)) return { error: 'Email không hợp lệ.' };
  if (message.length < 5) return { error: 'Thiếu nội dung.' };
  return { contact: { name, phone, email, message, topic: str(b.topic, 80), product: str(b.product, 120), page: str(b.page, 300), handled: false } };
}

/**
 * Ứng viên mã chuyển khoản trong 1 giao dịch.
 * Ngân hàng hay bỏ dấu, đổi chữ hoa/thường, chèn khoảng trắng → chuẩn hoá về A-Z0-9 rồi tìm "NMN" + 6 số.
 */
function payCodeCandidates(code, content){
  const out = [];
  const push = c => { if (c && !out.includes(c)) out.push(c); };
  if (code) push(payCode(code));
  const s = payCode(content);
  const re = /NMN\d{6}/g; let m;
  while ((m = re.exec(s))) push(s.substr(m.index, 14));          // NMN + 6 số + 5 ký tự
  return out.filter(c => /^NMN\d{6}[A-Z0-9]{5}$/.test(c));
}

/** Cộng tiền vào trạng thái thanh toán */
function applyPayment(status, amount){
  const paid = (Number(status.paid) || 0) + Math.max(0, Math.round(Number(amount) || 0));
  const total = Number(status.total) || 0;
  return { paid, state: paid >= total ? 'paid' : paid > 0 ? 'partial' : 'pending' };
}

/** So sánh khoá an toàn thời gian (tránh đoán khoá theo thời gian phản hồi) */
function safeEqual(a, b){
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0 && a.length > 0;
}

module.exports = { CODE_RE, str, payCode, newCode, catalog, buildOrder, buildContact, payCodeCandidates, applyPayment, safeEqual };
