/**
 * =====================================================================
 *  NMN website · Google Sheets làm cơ sở dữ liệu (Google Apps Script)
 * =====================================================================
 *  Gắn script này vào 1 Google Sheet → Sheet trở thành database của website:
 *
 *    Cài đặt · Sản phẩm · Bài viết · Sự kiện   ← nội dung website (CMS sửa, hoặc sửa thẳng trên Sheet)
 *    Đơn hàng · Thanh toán · Liên hệ           ← khách đặt hàng, chuyển khoản, gửi lời nhắn
 *    Ảnh                                       ← ảnh tải lên từ CMS (lưu trong Google Drive)
 *
 *  API (triển khai dạng Ứng dụng web — Web App):
 *    GET  ?action=content                 nội dung website (có bộ nhớ đệm)
 *    GET  ?action=status&code=NMN-…       trạng thái thanh toán của 1 đơn (không chứa thông tin khách)
 *    POST {action:"order", …}             tạo đơn hàng (giá TÍNH LẠI theo trang tính Sản phẩm)
 *    POST {action:"contact", …}           lưu lời nhắn trang Liên hệ
 *    POST {action:"admin.*", key, …}      dành cho trang quản trị (cần Khoá quản trị)
 *
 *  CÀI ĐẶT: xem README → "Google Sheets (database)". Tóm tắt:
 *    1. Dán toàn bộ file này vào Tiện ích mở rộng → Apps Script → Lưu.
 *    2. Tải lại Google Sheet → menu "NMN Website" → "① Cài đặt lần đầu" → cấp quyền.
 *    3. Triển khai → Tùy chọn triển khai mới → Ứng dụng web
 *       (Thực thi với tư cách: Tôi · Người có quyền truy cập: Bất kỳ ai) → sao chép URL /exec.
 *    4. Dán URL vào assets/js/config.js của website; dùng Khoá quản trị để đăng nhập CMS.
 *
 *  Script properties (Project Settings → Script properties) — tuỳ chọn:
 *    SEPAY_TOKEN    API token SePay (my.sepay.vn → Cấu hình công ty → API Access) → tự xác nhận chuyển khoản
 *    SEPAY_ACCOUNT  Số tài khoản nhận tiền (lọc đúng tài khoản)
 *    SITE_URL       Địa chỉ website để "Nhập nội dung từ website" (mặc định GitHub Pages bên dưới)
 *    NOTIFY_EMAIL   Email nhận thông báo đơn mới / lời nhắn mới ("off" = tắt)
 *  ADMIN_KEY do script tự tạo — xem bằng menu "Thông tin kết nối". Không dán khoá này vào website.
 */

const VERSION = '2026.11.04';
const DEFAULT_SITE_URL = 'https://lequyducmanh.github.io/nmn-website/';
const TZ = 'Asia/Ho_Chi_Minh';
const CONTENT = ['site', 'products', 'posts', 'events'];
const SHEET = { site: 'Cài đặt', products: 'Sản phẩm', posts: 'Bài viết', events: 'Sự kiện', orders: 'Đơn hàng', payments: 'Thanh toán', contacts: 'Liên hệ', images: 'Ảnh' };
const KEY_ROW = 2, DATA_ROW = 3;                 // hàng 1: tên cột tiếng Việt · hàng 2: mã trường (code dùng) · dữ liệu từ hàng 3
const CODE_RE = /^NMN-\d{6}-[A-Z0-9]{5}$/;
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAXQ = 99, MAX_LINES = 20, MAX_CELL = 49000;

/* Trạng thái hiển thị trên Sheet ↔ mã dùng trong API */
const FUL = { new: 'Mới', confirmed: 'Đã xác nhận', shipping: 'Đang giao', done: 'Hoàn tất', cancelled: 'Đã huỷ' };
const PAY = { pending: 'Chờ thanh toán', partial: 'Thiếu tiền', paid: 'Đã thanh toán', cod: 'COD' };
const METHOD = { bank: 'Chuyển khoản', cod: 'COD' };

/* ---------------------------------------------------------------------
   CẤU TRÚC TRANG TÍNH
   t: text · number · bool · date (yyyy-MM-dd) · datetime · json · lines (mỗi dòng 1 mục) · pairs ("A | B" mỗi dòng)
   d: giá trị khi ô trống
   --------------------------------------------------------------------- */
const F = (k, l, t, d, w) => ({ k: k, l: l, t: t || 'text', d: d, w: w });
const SCHEMA = {
  products: [
    F('slug', 'Đường dẫn (slug)', 'text', '', 150), F('name', 'Tên hiển thị', 'text', '', 200), F('price', 'Giá bán (đ)', 'number', 0, 110),
    F('compareAt', 'Giá gốc gạch ngang (đ)', 'number', null, 110), F('visible', 'Hiển thị', 'bool', true, 80), F('unlisted', 'Link riêng (ẩn khỏi danh sách)', 'bool', false, 90),
    F('upsell', 'Gợi ý “Thêm vào đơn”', 'bool', true, 90), F('officialName', 'Tên theo hồ sơ công bố', 'text', '', 240), F('claim', 'Công dụng (đúng hồ sơ)', 'text', '', 200),
    F('target', 'Đối tượng sử dụng', 'text', '', 160), F('tag', 'Nhãn ngắn', 'text', '', 140), F('short', 'Mô tả một dòng', 'text', '', 240),
    F('theme', 'Màu nền minh hoạ (pearl/rose/duo)', 'text', 'pearl', 100), F('image', 'Ảnh chính', 'text', '', 200), F('gallery', 'Ảnh phụ (mỗi dòng 1 ảnh)', 'lines', [], 200),
    F('desc', 'Mô tả', 'text', '', 280), F('highlights', 'Điểm nổi bật', 'lines', [], 240), F('specs', 'Thông số nhanh (Tên | Giá trị)', 'pairs', [], 220),
    F('ingredientsBasis', 'Đơn vị tính thành phần', 'text', '', 180), F('ingredients', 'Thành phần & hàm lượng', 'pairs', [], 240), F('excipients', 'Phụ liệu', 'text', '', 200),
    F('ingredientNotes', 'Giới thiệu thành phần', 'pairs', [], 240), F('usage', 'Hướng dẫn sử dụng', 'lines', [], 240), F('storage', 'Bảo quản', 'text', '', 200),
    F('warnings', 'Lưu ý', 'lines', [], 260), F('legal', 'Thông tin pháp lý', 'pairs', [], 240), F('homeSlot', 'Vị trí trang chủ (0 = không, 1, 2)', 'number', 0, 90),
    F('homeTag', 'Trang chủ · nhãn nhỏ', 'text', '', 160), F('homeTitle', 'Trang chủ · tiêu đề', 'text', '', 180), F('homeLead', 'Trang chủ · đoạn giới thiệu', 'text', '', 240),
    F('homeSpecs', 'Trang chủ · thông số', 'pairs', [], 200), F('forWho', 'Phù hợp với ai', 'text', '', 220)
  ],
  posts: [
    F('slug', 'Đường dẫn (slug)', 'text', '', 180), F('title', 'Tiêu đề', 'text', '', 260), F('date', 'Ngày đăng (yyyy-mm-dd)', 'date', '', 110),
    F('published', 'Đã đăng', 'bool', true, 80), F('type', 'Chuyên mục (kien-thuc/nghien-cuu/tin-tuc)', 'text', 'kien-thuc', 120), F('featured', 'Nổi bật', 'bool', false, 80),
    F('sample', 'Nhãn “Mẫu”', 'bool', false, 80), F('read', 'Số phút đọc', 'number', 1, 80), F('image', 'Ảnh bìa', 'text', '', 200),
    F('excerpt', 'Tóm tắt', 'text', '', 260), F('body', 'Nội dung (HTML)', 'text', '', 320)
  ],
  events: [
    F('slug', 'Đường dẫn (slug)', 'text', '', 180), F('title', 'Tên sự kiện', 'text', '', 240), F('date', 'Ngày (yyyy-mm-dd)', 'date', '', 110),
    F('time', 'Giờ', 'text', '', 110), F('place', 'Địa điểm', 'text', '', 200), F('city', 'Tỉnh / thành phố', 'text', '', 130), F('seats', 'Số chỗ', 'text', '', 90),
    F('published', 'Đã đăng', 'bool', true, 80), F('sample', 'Nhãn “Mẫu”', 'bool', false, 80), F('image', 'Ảnh bìa', 'text', '', 200),
    F('registerUrl', 'Link đăng ký', 'text', '', 200), F('desc', 'Mô tả (HTML)', 'text', '', 320)
  ],
  orders: [
    F('code', 'Mã đơn', 'text', '', 150), F('createdAt', 'Thời gian', 'datetime', '', 140), F('status', 'Xử lý', 'text', FUL.new, 110),
    F('payState', 'Thanh toán', 'text', PAY.cod, 120), F('method', 'Hình thức', 'text', METHOD.cod, 100), F('total', 'Tổng (đ)', 'number', 0, 110),
    F('paid', 'Đã nhận (đ)', 'number', 0, 110), F('name', 'Khách hàng', 'text', '', 160), F('phone', 'SĐT', 'text', '', 110), F('email', 'Email', 'text', '', 170),
    F('address', 'Địa chỉ giao hàng', 'text', '', 280), F('itemsText', 'Sản phẩm', 'text', '', 240), F('note', 'Ghi chú của khách', 'text', '', 200),
    F('adminNote', 'Ghi chú nội bộ', 'text', '', 200), F('payCode', 'Nội dung CK', 'text', '', 140), F('paidAt', 'Thời điểm thanh toán', 'datetime', '', 140),
    F('subtotal', 'Tạm tính (đ)', 'number', 0, 110), F('shipping', 'Phí ship (trống = báo sau)', 'number', null, 110), F('province', 'Tỉnh/TP', 'text', '', 130),
    F('ward', 'Phường/Xã', 'text', '', 130), F('street', 'Số nhà, đường', 'text', '', 180), F('items', 'Chi tiết (JSON)', 'json', [], 160),
    F('check', 'Kiểm tra', 'text', '', 200), F('updatedAt', 'Cập nhật lúc', 'datetime', '', 140)
  ],
  payments: [
    F('id', 'Mã giao dịch SePay', 'text', '', 120), F('date', 'Thời gian giao dịch', 'text', '', 150), F('amount', 'Số tiền (đ)', 'number', 0, 110),
    F('content', 'Nội dung', 'text', '', 300), F('orderCode', 'Đơn khớp', 'text', '', 150), F('bank', 'Ngân hàng', 'text', '', 110),
    F('account', 'Tài khoản', 'text', '', 120), F('ref', 'Số tham chiếu', 'text', '', 140), F('createdAt', 'Ghi nhận lúc', 'datetime', '', 140)
  ],
  contacts: [
    F('id', 'Mã', 'text', '', 130), F('createdAt', 'Thời gian', 'datetime', '', 140), F('handled', 'Đã xử lý', 'bool', false, 80),
    F('name', 'Họ tên', 'text', '', 160), F('phone', 'SĐT', 'text', '', 110), F('email', 'Email', 'text', '', 170), F('topic', 'Chủ đề', 'text', '', 150),
    F('product', 'Sản phẩm', 'text', '', 150), F('message', 'Nội dung', 'text', '', 360), F('page', 'Trang gửi', 'text', '', 200)
  ],
  images: [
    F('id', 'Mã file Drive', 'text', '', 160), F('url', 'Đường dẫn ảnh', 'text', '', 300), F('name', 'Tên file', 'text', '', 200),
    F('folder', 'Thư mục', 'text', '', 90), F('size', 'Dung lượng (byte)', 'number', 0, 110), F('createdAt', 'Tải lên lúc', 'datetime', '', 140)
  ]
};
const CHOICES = { orders: { status: Object.keys(FUL).map(k => FUL[k]), payState: Object.keys(PAY).map(k => PAY[k]), method: [METHOD.bank, METHOD.cod] } };

/* Trang tính "Cài đặt": Khoá | Giá trị | Kiểu | Mô tả */
const SETTING_TYPES = { shippingFee: 'number', freeShippingFrom: 'number', postsPerPage: 'number', 'upsell.max': 'number', perks: 'lines', 'home.heroMeta': 'pairs', 'home.marquee': 'lines', 'contact.topics': 'lines', 'contact.faq': 'pairs' };
const SETTING_LABELS = {
  brand: 'Tên thương hiệu (logo)', brandTagline: 'Dòng chữ nhỏ dưới logo', shopName: 'Tên cửa hàng / công ty', phone: 'Hotline', zalo: 'Số Zalo', email: 'Email', address: 'Địa chỉ',
  priceNote: 'Ghi chú dưới giá', postsPerPage: 'Số bài mỗi lần tải ở trang Tin tức', shippingFee: 'Phí giao hàng (trống = báo khi xác nhận đơn)', freeShippingFrom: 'Miễn phí giao hàng từ (trống = không áp dụng)',
  'bank.code': 'Mã ngân hàng VietQR (VCB, MB, ACB…)', 'bank.account': 'Số tài khoản', 'bank.owner': 'Chủ tài khoản', 'bank.name': 'Tên ngân hàng hiển thị', 'bank.autoConfirm': 'Tự động xác nhận chuyển khoản (SePay)',
  perks: 'Cam kết hiển thị ở cửa hàng (mỗi dòng 1 ý)', 'seo.title': 'Tiêu đề trang chủ (Google)', 'seo.description': 'Mô tả ngắn (Google)',
  'home.heroEyebrow': 'Trang chủ · dòng chữ nhỏ', 'home.heroTitle': 'Trang chủ · tiêu đề lớn (*chữ* = nhấn mạnh)', 'home.heroLead': 'Trang chủ · đoạn giới thiệu', 'home.heroMeta': 'Trang chủ · ba điểm nổi bật (Chữ lớn | Chữ nhỏ)',
  'home.marquee': 'Trang chủ · dải chữ chạy', 'home.contactEyebrow': 'Trang chủ · liên hệ · dòng nhỏ', 'home.contactTitle': 'Trang chủ · liên hệ · tiêu đề', 'home.contactLead': 'Trang chủ · liên hệ · mô tả',
  'company.name': 'Tên doanh nghiệp', 'company.taxCode': 'Mã số doanh nghiệp', 'company.address': 'Địa chỉ trụ sở', 'company.phone': 'Điện thoại doanh nghiệp', 'company.email': 'Email doanh nghiệp',
  'contact.eyebrow': 'Liên hệ · dòng chữ nhỏ', 'contact.title': 'Liên hệ · tiêu đề', 'contact.lead': 'Liên hệ · đoạn mô tả', 'contact.hours': 'Giờ làm việc', 'contact.showMap': 'Hiện bản đồ',
  'contact.mapQuery': 'Địa điểm trên bản đồ', 'contact.topics': 'Chủ đề khách chọn (mỗi dòng 1 chủ đề)', 'contact.consent': 'Câu xin đồng ý liên hệ lại', 'contact.faq': 'Hỏi & đáp (Câu hỏi | Trả lời)',
  'upsell.enabled': 'Bật gợi ý “Thêm vào đơn”', 'upsell.title': 'Tiêu đề mục gợi ý', 'upsell.max': 'Số sản phẩm gợi ý hiển thị sẵn'
};
const DROP_SETTINGS = { orderEndpoint: 1, 'contact.formEndpoint': 1 };   // khoá cũ (bản GitHub/Firebase) — không dùng nữa

/* =====================================================================
   TIỆN ÍCH
   ===================================================================== */
const props_ = () => PropertiesService.getScriptProperties();
const prop_ = k => props_().getProperty(k) || '';
const ss_ = () => SpreadsheetApp.getActiveSpreadsheet();
const str_ = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max);
const line_ = (v, max) => str_(v, max).replace(/\s*\n\s*/g, ' ');
const payCode_ = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const phoneOk_ = p => /^(0|\+?84)(3|5|7|8|9)\d{8}$/.test(p);
const emailOk_ = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const iso_ = d => d instanceof Date && !isNaN(d) ? d.toISOString() : d ? String(d) : null;
const ymd_ = d => Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
function out_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail_(msg, extra){ const o = { ok: false, error: msg }; if (extra) Object.keys(extra).forEach(k => o[k] = extra[k]); return o; }
function getP_(o, path){ return path.split('.').reduce((a, k) => a == null ? a : a[k], o); }
function setP_(o, path, v){ const ks = path.split('.'), last = ks.pop(); const t = ks.reduce((a, k) => (a[k] == null || typeof a[k] !== 'object' ? (a[k] = {}) : a[k]), o); t[last] = v; }
function safeEqual_(a, b){
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0 && a.length > 0;
}
function randomKey_(prefix){ return prefix + (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function withLock_(fn, ms){
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(ms || 20000)) throw new Error('Hệ thống đang bận, vui lòng thử lại sau ít giây.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- mã hoá / giải mã 1 ô theo kiểu ----------
   Ô chữ luôn được đặt định dạng "Văn bản thuần" (@) TRƯỚC khi ghi → Sheets giữ nguyên chuỗi
   (không tự đổi "0985…" thành số, "2026-10-01" thành ngày, "=…" thành công thức). */
function enc_(t, v){
  if (t === 'number'){ if (v === '' || v == null) return ''; const n = Number(v); return isFinite(n) ? n : ''; }
  if (t === 'bool') return v === true || v === 'true' || v === 1;
  if (t === 'datetime'){ if (!v) return ''; const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? '' : d; }
  let s;
  if (t === 'json') s = v == null ? '' : JSON.stringify(v);
  else if (t === 'lines'){
    const a = Array.isArray(v) ? v.map(x => String(x == null ? '' : x)) : [];
    s = a.some(x => /\n/.test(x) || x !== x.trim() || x === '') ? JSON.stringify(a) : a.join('\n');
  } else if (t === 'pairs'){
    const a = Array.isArray(v) ? v : [];
    const plain = a.every(p => Array.isArray(p) && p.length === 2 && p.every(x => typeof x === 'string' && !/[|\n]/.test(x) && x === x.trim()) && p[0] !== '');
    s = plain ? a.map(p => p[0] + ' | ' + p[1]).join('\n') : JSON.stringify(a);
  } else s = v == null ? '' : String(v);
  if (s.length > MAX_CELL) throw new Error('Nội dung quá dài cho 1 ô Google Sheet (tối đa ' + MAX_CELL + ' ký tự).');
  return s;
}
function dec_(t, v, d){
  const empty = v === '' || v == null;
  if (t === 'number'){
    if (typeof v === 'number') return v;
    if (empty) return d === undefined ? null : d;
    const n = Number(String(v).replace(/[^\d\-]/g, ''));
    return isFinite(n) && String(v).match(/\d/) ? n : (d === undefined ? null : d);
  }
  if (t === 'bool'){
    if (v === true || v === false) return v;
    if (empty) return d === undefined ? false : d;
    return /^(true|1|x|có|co|yes|y|✓)$/i.test(String(v).trim());
  }
  if (t === 'datetime') return empty ? null : iso_(v instanceof Date ? v : new Date(v)) || String(v);
  if (t === 'date'){ if (v instanceof Date) return ymd_(v); return empty ? (d || '') : String(v).trim(); }
  if (empty) return d === undefined ? (t === 'json' ? null : '') : clone_(d);
  if (v instanceof Date) v = ymd_(v);
  const s = String(v);
  if (t === 'json'){ try { return JSON.parse(s); } catch (e) { return clone_(d === undefined ? null : d); } }
  if (t === 'lines' || t === 'pairs'){
    if (/^\s*\[/.test(s)){ try { const a = JSON.parse(s); if (Array.isArray(a)) return a; } catch (e) {} }
    const lines = s.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (t === 'lines') return lines;
    return lines.map(x => { const i = x.indexOf('|'); return i < 0 ? [x, ''] : [x.slice(0, i).trim(), x.slice(i + 1).trim()]; });
  }
  return typeof v === 'number' ? String(v) : s;
}
const clone_ = v => v == null ? v : JSON.parse(JSON.stringify(v));
const FORMAT = { number: '#,##0', datetime: 'dd/MM/yyyy HH:mm:ss' };

/* =====================================================================
   LỚP BẢNG (hàng 1 nhãn · hàng 2 mã trường · dữ liệu từ hàng 3)
   ===================================================================== */
const HEAD_MEMO = {};
function sheet_(name, create){
  let sh = ss_().getSheetByName(SHEET[name]);
  if (!sh && create) sh = ss_().insertSheet(SHEET[name]);
  return sh;
}
function fieldOf_(name, key){ return (SCHEMA[name] || []).find(f => f.k === key); }
/** Đọc tiêu đề: { sh, cols: { key: {c, t, d} }, width }. ensure = thêm cột còn thiếu (chỉ khi ghi) */
function head_(name, ensure){
  if (HEAD_MEMO[name] && (!ensure || HEAD_MEMO[name].ensured)) return HEAD_MEMO[name];
  const sh = sheet_(name, ensure);
  if (!sh) return null;
  let width = sh.getLastColumn();
  const keys = width ? sh.getRange(KEY_ROW, 1, 1, width).getValues()[0].map(x => String(x || '').trim()) : [];
  const cols = {};
  keys.forEach((raw, i) => {
    if (!raw) return;
    const parts = raw.split(':'), k = parts[0], f = fieldOf_(name, k);
    if (!cols[k]) cols[k] = { c: i + 1, t: f ? f.t : (parts[1] || 'json'), d: f ? f.d : undefined };
  });
  if (ensure){
    const missing = SCHEMA[name].filter(f => !cols[f.k]);
    if (missing.length){
      const start = width + 1;
      sh.getRange(1, start, 2, missing.length).setValues([missing.map(f => f.l), missing.map(f => f.k)]);
      missing.forEach((f, i) => { cols[f.k] = { c: start + i, t: f.t, d: f.d }; if (f.w) sh.setColumnWidth(start + i, f.w); });
      width += missing.length;
      styleHead_(sh, width);
    }
  }
  return (HEAD_MEMO[name] = { sh: sh, cols: cols, width: width, ensured: !!ensure });
}
function addColumn_(name, key, t){
  const h = head_(name, true), c = h.width + 1;
  h.sh.getRange(1, c, 2, 1).setValues([[key], [key + ':' + t]]);
  h.cols[key] = { c: c, t: t }; h.width = c;
  return h.cols[key];
}
function styleHead_(sh, width){
  if (!width) return;
  sh.setFrozenRows(2);
  sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#13202a').setFontColor('#f7f2e8').setVerticalAlignment('middle').setWrap(true);
  sh.getRange(2, 1, 1, width).setFontSize(8).setFontColor('#8a8f94').setBackground('#f4f0e9');
  try { const p = sh.getRange(2, 1, 1, width).protect(); p.setDescription('Mã trường — website đọc cột theo hàng này, đừng sửa'); p.setWarningOnly(true); } catch (e) {}
}
function rowCount_(sh){ return Math.max(0, sh.getLastRow() - DATA_ROW + 1); }
/** Đọc toàn bộ bảng → mảng object (mỗi object có _row = số hàng trên Sheet) */
function readTable_(name, opts){
  const h = head_(name, false);
  const fields = SCHEMA[name];
  if (!h) return [];
  const n = rowCount_(h.sh); if (!n || !h.width) return [];
  const first = opts && opts.last ? Math.max(DATA_ROW, DATA_ROW + n - opts.last) : DATA_ROW;
  const vals = h.sh.getRange(first, 1, DATA_ROW + n - first, h.width).getValues();
  const out = [], pk = h.cols[fields[0].k];
  vals.forEach((r, i) => {
    if (!pk || r[pk.c - 1] === '' || r[pk.c - 1] == null) return;          // bỏ hàng trống (không có slug / mã)
    const o = {};
    fields.forEach(f => { const col = h.cols[f.k]; o[f.k] = dec_(f.t, col ? r[col.c - 1] : '', f.d); });
    Object.keys(h.cols).forEach(k => { if (!(k in o)) o[k] = dec_(h.cols[k].t, r[h.cols[k].c - 1]); });
    o._row = first + i;
    out.push(o);
  });
  return out;
}
/** Định dạng + ô tích cho 1 vùng hàng dữ liệu (gọi TRƯỚC khi ghi giá trị) */
function formatRows_(h, row, n){
  if (n <= 0) return;
  Object.keys(h.cols).forEach(k => {
    const c = h.cols[k], r = h.sh.getRange(row, c.c, n, 1);
    if (c.t === 'bool') r.insertCheckboxes();
    else r.setNumberFormat(FORMAT[c.t] || '@');
  });
}
function rowValues_(h, o){
  const r = new Array(h.width).fill('');
  Object.keys(h.cols).forEach(k => { const c = h.cols[k]; if (o[k] !== undefined) r[c.c - 1] = enc_(c.t, o[k]); else if (c.t === 'bool') r[c.c - 1] = enc_('bool', c.d === true); });
  return r;
}
function writeTable_(name, items){
  const h = head_(name, true);
  items.forEach(o => Object.keys(o).forEach(k => {
    if (k === '_row' || h.cols[k] || o[k] === undefined) return;
    addColumn_(name, k, typeof o[k] === 'string' ? 'text' : 'json');
  }));
  const old = rowCount_(h.sh);
  if (old) h.sh.getRange(DATA_ROW, 1, old, h.width).clearContent().clearDataValidations();
  if (!items.length) return;
  formatRows_(h, DATA_ROW, items.length);
  h.sh.getRange(DATA_ROW, 1, items.length, h.width).setValues(items.map(o => rowValues_(h, o)));
}
function appendRow_(name, o){
  const h = head_(name, true), row = Math.max(h.sh.getLastRow() + 1, DATA_ROW);
  formatRows_(h, row, 1);
  h.sh.getRange(row, 1, 1, h.width).setValues([rowValues_(h, o)]);
  applyChoices_(name, h, row, 1);
  return row;
}
function updateRow_(name, row, patch){
  const h = head_(name, true);
  Object.keys(patch).forEach(k => {
    const c = h.cols[k]; if (!c) return;
    const r = h.sh.getRange(row, c.c);
    if (c.t !== 'bool') r.setNumberFormat(FORMAT[c.t] || '@');
    r.setValue(enc_(c.t, patch[k]));
  });
}
function applyChoices_(name, h, row, n){
  const ch = CHOICES[name]; if (!ch) return;
  Object.keys(ch).forEach(k => { if (h.cols[k]) h.sh.getRange(row, h.cols[k].c, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ch[k], true).setAllowInvalid(true).build()); });
}
/** Tìm 1 hàng theo giá trị cột (chỉ đọc cột đó — nhanh) */
function findRow_(name, key, match){
  const h = head_(name, false); if (!h || !h.cols[key]) return 0;
  const n = rowCount_(h.sh); if (!n) return 0;
  const col = h.sh.getRange(DATA_ROW, h.cols[key].c, n, 1).getValues();
  for (let i = n - 1; i >= 0; i--) if (match(String(col[i][0]))) return DATA_ROW + i;
  return 0;
}
function readRow_(name, row){
  const h = head_(name, false), r = h.sh.getRange(row, 1, 1, h.width).getValues()[0], o = { _row: row };
  SCHEMA[name].forEach(f => { const c = h.cols[f.k]; o[f.k] = dec_(f.t, c ? r[c.c - 1] : '', f.d); });
  return o;
}

/* =====================================================================
   CÀI ĐẶT (Khoá | Giá trị | Kiểu | Mô tả)
   ===================================================================== */
const SET_HEAD = ['Khoá', 'Giá trị', 'Kiểu', 'Mô tả'];
function readSettings_(){
  const sh = sheet_('site', false), o = {};
  if (!sh || sh.getLastRow() < 2) return o;
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(r => {
    const k = String(r[0] || '').trim(); if (!k || DROP_SETTINGS[k]) return;
    const t = String(r[2] || '').trim() || SETTING_TYPES[k] || 'text';
    setP_(o, k, dec_(t, r[1], t === 'bool' ? false : t === 'lines' || t === 'pairs' ? [] : t === 'number' || t === 'json' ? null : ''));
  });
  return o;
}
function flatten_(o, base, out){
  Object.keys(o || {}).forEach(k => {
    const p = base ? base + '.' + k : k, v = o[k];
    if (DROP_SETTINGS[p]) return;
    if (v && typeof v === 'object' && !Array.isArray(v)) return flatten_(v, p, out);
    let t = SETTING_TYPES[p];
    if (!t){
      if (typeof v === 'number') t = 'number';
      else if (typeof v === 'boolean') t = 'bool';
      else if (typeof v === 'string') t = 'text';
      else if (Array.isArray(v)) t = v.every(x => typeof x === 'string') ? 'lines' : v.every(x => Array.isArray(x) && x.length === 2) ? 'pairs' : 'json';
      else t = 'json';
    }
    out.push([p, v, t]);
  });
  return out;
}
function writeSettings_(site){
  const sh = sheet_('site', true);
  const prev = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(r => { if (r[0]) prev[String(r[0]).trim()] = r; });
  const rows = flatten_(site, '', []);
  sh.getRange(1, 1, 1, 4).setValues([SET_HEAD]);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 4).clearContent().clearDataValidations();
  if (!rows.length) return;
  [1, 3, 4].forEach(c => sh.getRange(2, c, rows.length, 1).setNumberFormat('@'));
  rows.forEach((r, i) => { const c = sh.getRange(2 + i, 2); if (r[2] === 'bool') c.insertCheckboxes(); else c.setNumberFormat(FORMAT[r[2]] || '@'); });
  sh.getRange(2, 1, rows.length, 4).setValues(rows.map(r => [r[0], enc_(r[2], r[1]), r[2], (prev[r[0]] && prev[r[0]][3]) || SETTING_LABELS[r[0]] || '']));
}

/* =====================================================================
   NỘI DUNG WEBSITE + BỘ NHỚ ĐỆM
   ===================================================================== */
function clean_(o){ if (Array.isArray(o)) return o.map(clean_); const c = {}; Object.keys(o).forEach(k => { if (k !== '_row') c[k] = o[k]; }); return c; }
function readContent_(){
  return { site: readSettings_(), products: readTable_('products').map(clean_), posts: readTable_('posts').map(clean_), events: readTable_('events').map(clean_) };
}
function revs_(){ const P = props_(); const r = {}; CONTENT.forEach(f => r[f] = P.getProperty('REV_' + f) || '0'); return r; }
function gen_(){ return prop_('GEN') || '0'; }
/** Đánh dấu nội dung đã đổi → bản đệm cũ bị bỏ qua */
function bump_(files){
  const P = props_(), now = String(Date.now()), o = { GEN: now };
  files.forEach(f => o['REV_' + f] = now);
  P.setProperties(o);
  try { CacheService.getScriptCache().remove('content'); } catch (e) {}
}
const CHUNK = 90000;
function content_(){
  const cache = CacheService.getScriptCache(), gen = gen_(), key = 'content:' + gen;
  try {
    const meta = cache.get(key);
    if (meta){
      const n = Number(meta), parts = cache.getAll(Array.from({ length: n }, (_, i) => key + ':' + i));
      const s = Array.from({ length: n }, (_, i) => parts[key + ':' + i]);
      if (s.every(x => x != null)) return { gen: gen, json: s.join('') };
    }
  } catch (e) {}
  const json = JSON.stringify(readContent_());
  try {
    const put = {}, n = Math.ceil(json.length / CHUNK) || 1;
    for (let i = 0; i < n; i++) put[key + ':' + i] = json.slice(i * CHUNK, (i + 1) * CHUNK);
    put[key] = String(n);
    cache.putAll(put, 21600);
  } catch (e) {}
  return { gen: gen, json: json };
}
function contentData_(){ return JSON.parse(content_().json); }

/* =====================================================================
   ĐƠN HÀNG — kiểm tra, tính lại tiền theo bảng giá trên Sheet
   ===================================================================== */
function catalog_(products, site){
  const c = { price: {}, name: {}, ship: null, free: null, bank: false };
  (products || []).forEach(p => { if (p && p.slug && p.visible !== false){ c.price[p.slug] = Math.max(0, Math.round(Number(p.price) || 0)); c.name[p.slug] = String(p.name || p.slug); } });
  if (site){
    c.ship = site.shippingFee == null || site.shippingFee === '' ? null : Math.max(0, Number(site.shippingFee) || 0);
    c.free = site.freeShippingFrom == null || site.freeShippingFrom === '' ? null : Math.max(0, Number(site.freeShippingFrom) || 0);
    c.bank = !!(site.bank && site.bank.code && site.bank.account);
  }
  return c;
}
function buildOrder_(b, cat){
  const cu = b.customer || {}, items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return { error: 'Giỏ hàng trống.' };
  if (items.length > MAX_LINES) return { error: 'Quá nhiều sản phẩm trong một đơn.' };
  const lines = [], seen = {};
  for (let i = 0; i < items.length; i++){
    const it = items[i] || {}, slug = str_(it.slug, 80), qty = parseInt(it.qty, 10);
    if (!(slug in cat.price)) return { error: 'Sản phẩm không còn bán: ' + slug };
    if (!(qty >= 1 && qty <= MAXQ)) return { error: 'Số lượng không hợp lệ.' };
    if (seen[slug]) return { error: 'Sản phẩm bị lặp.' };
    seen[slug] = 1;
    lines.push({ slug: slug, name: cat.name[slug], price: cat.price[slug], qty: qty, lineTotal: cat.price[slug] * qty });
  }
  const name = line_(cu.name, 80), phone = str_(cu.phone, 20).replace(/[\s.\-()]/g, ''), email = str_(cu.email, 120);
  if (name.length < 2) return { error: 'Thiếu họ tên.' };
  if (!phoneOk_(phone)) return { error: 'Số điện thoại không hợp lệ.' };
  if (!emailOk_(email)) return { error: 'Email không hợp lệ.' };
  const province = line_(cu.province || cu.city, 80), street = line_(cu.street || cu.address, 200), ward = line_(cu.ward, 80);
  if (province.length < 2 || street.length < 3) return { error: 'Thiếu địa chỉ nhận hàng.' };
  const method = b.payment === 'bank' ? 'bank' : 'cod';
  if (method === 'bank' && !cat.bank) return { error: 'Cửa hàng chưa bật chuyển khoản.' };
  const sub = lines.reduce((s, l) => s + l.lineTotal, 0);
  let ship = cat.ship; if (cat.free != null && sub >= cat.free) ship = 0;
  return { order: {
    code: CODE_RE.test(String(b.code || '')) ? String(b.code) : '', items: lines, subtotal: sub, shipping: ship, total: sub + (ship || 0),
    clientTotal: Number(b.total) || 0, method: method,
    name: name, phone: phone, email: email, province: province, ward: ward, street: street,
    address: line_(cu.fullAddress, 320) || [street, ward, province].filter(Boolean).join(', '), note: str_(cu.note, 500)
  } };
}
function newCode_(){ let r = ''; for (let i = 0; i < 5; i++) r += ABC[Math.floor(Math.random() * ABC.length)]; return 'NMN-' + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + '-' + r; }

/** Giới hạn số lần gửi (chống spam): tối đa max lần / sec giây cho mỗi khoá */
function limited_(key, max, sec){
  const cache = CacheService.getScriptCache(), k = 'rl:' + key, n = Number(cache.get(k) || 0);
  if (n >= max) return true;
  cache.put(k, String(n + 1), sec);
  return false;
}

function createOrder_(b){
  if (b.hp) return { ok: true, code: newCode_(), ignored: true };                      // bẫy bot (ô ẩn)
  const C = contentData_();
  const r = buildOrder_(b, catalog_(C.products, C.site));
  if (r.error) return fail_(r.error);
  const o = r.order;
  const res = withLock_(() => {
    if (o.code){
      const row = findRow_('orders', 'code', v => v === o.code);
      if (row){
        const ex = readRow_('orders', row);
        if (ex.phone === o.phone) return { ok: true, duplicate: true, code: ex.code, payCode: ex.payCode || payCode_(ex.code), subtotal: ex.subtotal, shipping: ex.shipping, total: ex.total, items: ex.items };
        o.code = '';
      }
    }
    if (limited_('o:' + o.phone, 6, 600) || limited_('o:*', 60, 600)) return fail_('Bạn đã gửi nhiều đơn liên tiếp. Vui lòng thử lại sau ít phút hoặc gọi hotline.');
    while (!o.code || findRow_('orders', 'code', v => v === o.code)) o.code = newCode_();
    const bank = o.method === 'bank', now = new Date();
    const check = o.clientTotal && o.clientTotal !== o.total ? '⚠ Tổng tiền được tính lại theo bảng giá (trình duyệt gửi ' + o.clientTotal + ')' : 'OK';
    appendRow_('orders', {
      code: o.code, createdAt: now, status: FUL.new, payState: bank ? PAY.pending : PAY.cod, method: METHOD[o.method],
      total: o.total, paid: bank ? 0 : '', name: o.name, phone: o.phone, email: o.email, address: o.address,
      itemsText: o.items.map(i => i.name + ' × ' + i.qty).join(', '), note: o.note, adminNote: '', payCode: bank ? payCode_(o.code) : '', paidAt: '',
      subtotal: o.subtotal, shipping: o.shipping, province: o.province, ward: o.ward, street: o.street, items: o.items, check: check, updatedAt: now
    });
    return { ok: true, code: o.code, payCode: payCode_(o.code), subtotal: o.subtotal, shipping: o.shipping, total: o.total, items: o.items };
  });
  if (res.ok && !res.duplicate) notify_('🛒 Đơn hàng mới ' + res.code + ' · ' + money_(o.total), [
    'Khách hàng: ' + o.name + ' · ' + o.phone + (o.email ? ' · ' + o.email : ''), 'Địa chỉ: ' + o.address, '',
    o.items.map(i => '- ' + i.name + ' × ' + i.qty + ' = ' + money_(i.lineTotal)).join('\n'), '',
    'Tạm tính: ' + money_(o.subtotal), 'Phí giao hàng: ' + (o.shipping == null ? 'báo sau' : money_(o.shipping)), 'Tổng: ' + money_(o.total),
    'Thanh toán: ' + (o.method === 'bank' ? 'Chuyển khoản · nội dung ' + payCode_(res.code) : 'COD'), o.note ? 'Ghi chú: ' + o.note : ''
  ].join('\n'));
  return res;
}
const money_ = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';

function createContact_(b){
  if (b.hp) return { ok: true, ignored: true };
  const name = line_(b.name, 80), phone = str_(b.phone, 20).replace(/[\s.\-()]/g, ''), email = str_(b.email, 120), message = str_(b.message, 1500);
  if (name.length < 2) return fail_('Thiếu họ tên.');
  if (!phoneOk_(phone)) return fail_('Số điện thoại không hợp lệ.');
  if (!emailOk_(email)) return fail_('Email không hợp lệ.');
  if (message.length < 5) return fail_('Thiếu nội dung.');
  const c = { id: /^LH-[A-Z0-9-]{4,24}$/.test(String(b.code || '')) ? String(b.code) : 'LH-' + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + '-' + newCode_().slice(-5),
    createdAt: new Date(), handled: false, name: name, phone: phone, email: email, topic: line_(b.topic, 80), product: line_(b.product, 120), message: message, page: line_(b.page, 300) };
  const res = withLock_(() => {
    if (findRow_('contacts', 'id', v => v === c.id)) return { ok: true, duplicate: true, id: c.id };
    if (limited_('c:' + phone, 5, 600) || limited_('c:*', 60, 600)) return fail_('Bạn đã gửi nhiều lời nhắn liên tiếp. Vui lòng thử lại sau ít phút.');
    appendRow_('contacts', c);
    return { ok: true, id: c.id };
  });
  if (res.ok && !res.duplicate) notify_('✉ Lời nhắn mới từ ' + name, ['Họ tên: ' + name, 'SĐT: ' + phone, email ? 'Email: ' + email : '', c.topic ? 'Chủ đề: ' + c.topic : '', c.product ? 'Sản phẩm: ' + c.product : '', '', message].join('\n'));
  return res;
}

function notify_(subject, body){
  const to = prop_('NOTIFY_EMAIL');
  if (!to || to === 'off') return;
  try { MailApp.sendEmail({ to: to, subject: subject, body: body + '\n\n— Mở Google Sheet: ' + ss_().getUrl() }); } catch (e) { console.warn('notify', e); }
}

/* ---------- trạng thái thanh toán (trang xác nhận đơn hỏi mỗi vài giây) ---------- */
function status_(code){
  code = String(code || '').toUpperCase();
  if (!/^[A-Z0-9-]{6,32}$/.test(code)) return { status: 'bad_code' };
  const pc = payCode_(code), find = () => { const r = findRow_('orders', 'code', v => v === code || payCode_(v) === pc); return r ? readRow_('orders', r) : null; };
  let o = find();
  if (!o) return { status: 'not_found' };
  if (o.method !== METHOD.bank) return { status: 'cod' };
  if (o.payState !== PAY.paid){
    if (!prop_('SEPAY_TOKEN')) return { status: 'off' };
    syncPayments_(false);
    HEAD_MEMO.orders = null;
    o = find();
  }
  return { status: o.payState === PAY.paid ? 'paid' : o.paid > 0 ? 'partial' : 'pending', paid: o.paid || 0, total: o.total, at: o.paidAt || null };
}

/* =====================================================================
   SEPAY — đối soát giao dịch (API chính thức, chỉ tiền vào thật mới tính)
   ===================================================================== */
function syncPayments(){ return syncPayments_(true); }                  // Trigger mỗi phút
function payCandidates_(code, content){
  const out = [], push = c => { if (c && out.indexOf(c) < 0) out.push(c); };
  if (code) push(payCode_(code));
  const s = payCode_(content), re = /NMN\d{6}/g; let m;
  while ((m = re.exec(s))) push(s.substr(m.index, 14));
  return out.filter(c => /^NMN\d{6}[A-Z0-9]{5}$/.test(c));
}
function syncPayments_(force){
  const P = props_(), token = P.getProperty('SEPAY_TOKEN');
  if (!token) return { ok: false, error: 'Chưa đặt SEPAY_TOKEN trong Script properties.' };
  const cache = CacheService.getScriptCache();
  if (!force && cache.get('synced')) return { ok: true, skipped: true };   // nhiều khách cùng hỏi: tối đa 1 lần gọi SePay / 3 giây
  cache.put('synced', '1', 3);
  const lock = LockService.getScriptLock(); if (!lock.tryLock(8000)) return { ok: true, busy: true };
  try {
    const acc = P.getProperty('SEPAY_ACCOUNT') || '', lastId = Number(P.getProperty('LAST_TX_ID') || 0);
    let url = 'https://my.sepay.vn/userapi/transactions/list?limit=200' + (acc ? '&account_number=' + encodeURIComponent(acc) : '');
    url += lastId ? '&since_id=' + (lastId + 1) : '&transaction_date_min=' + Utilities.formatDate(new Date(Date.now() - 3 * 864e5), TZ, 'yyyy-MM-dd');
    const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    P.setProperty('SEPAY_LAST_SYNC', new Date().toISOString());
    if (res.getResponseCode() !== 200){ P.setProperty('SEPAY_LAST_ERROR', 'HTTP ' + res.getResponseCode()); return { ok: false, error: 'SePay trả lỗi HTTP ' + res.getResponseCode() + ' — kiểm tra SEPAY_TOKEN.' }; }
    P.deleteProperty('SEPAY_LAST_ERROR');
    const txs = (JSON.parse(res.getContentText()).transactions || []).sort((a, b) => Number(a.id) - Number(b.id));
    if (!txs.length) return { ok: true, added: 0 };
    const seen = {}; readTable_('payments', { last: 2000 }).forEach(p => seen[p.id] = 1);
    const orders = readTable_('orders', { last: 3000 }).filter(o => o.method === METHOD.bank && o.payState !== PAY.paid && o.status !== FUL.cancelled);
    let maxId = lastId, added = 0, matched = 0;
    txs.forEach(tx => {
      const id = String(tx.id); maxId = Math.max(maxId, Number(tx.id) || 0);
      const amount = Math.round(Number(tx.amount_in) || 0);
      if (seen[id] || amount <= 0) return;
      const cands = payCandidates_(tx.code, tx.transaction_content);
      const hit = orders.find(o => cands.indexOf(o.payCode || payCode_(o.code)) >= 0);
      appendRow_('payments', { id: id, date: String(tx.transaction_date || ''), amount: amount, content: String(tx.transaction_content || ''), orderCode: hit ? hit.code : '',
        bank: String(tx.bank_brand_name || ''), account: String(tx.account_number || ''), ref: String(tx.reference_number || ''), createdAt: new Date() });
      seen[id] = 1; added++;
      if (!hit) return;
      matched++;
      hit.paid = (Number(hit.paid) || 0) + amount;
      hit.payState = hit.paid >= hit.total ? PAY.paid : PAY.partial;
      const patch = { paid: hit.paid, payState: hit.payState, updatedAt: new Date() };
      if (hit.payState === PAY.paid){ patch.paidAt = new Date(); orders.splice(orders.indexOf(hit), 1); }
      updateRow_('orders', hit._row, patch);
    });
    P.setProperty('LAST_TX_ID', String(maxId));
    return { ok: true, added: added, matched: matched };
  } finally { lock.releaseLock(); }
}

/* =====================================================================
   QUẢN TRỊ (CMS + trang Quản lý đơn hàng) — cần Khoá quản trị
   ===================================================================== */
function auth_(b){
  const cache = CacheService.getScriptCache();
  if (Number(cache.get('authfail') || 0) > 30) return 'Quá nhiều lần nhập sai khoá. Thử lại sau 15 phút.';
  if (safeEqual_(b.key, prop_('ADMIN_KEY'))) return '';
  cache.put('authfail', String(Number(cache.get('authfail') || 0) + 1), 900);
  return 'Khoá quản trị không đúng.';
}
const ADMIN = {
  ping: () => ({ ok: true, version: VERSION, sheetUrl: ss_().getUrl(), sheetName: ss_().getName(), revs: revs_(), sepay: !!prop_('SEPAY_TOKEN'), notify: prop_('NOTIFY_EMAIL') !== 'off' && !!prop_('NOTIFY_EMAIL') }),
  content: () => {
    const data = readContent_();
    const empty = !data.products.length && !Object.keys(data.site).length;
    return { ok: true, data: data, revs: revs_(), empty: empty, sheetUrl: ss_().getUrl(), images: images_(), sepay: !!prop_('SEPAY_TOKEN') };
  },
  save: b => withLock_(() => {
    const data = b.data || {}, files = CONTENT.filter(f => f in data);
    if (!files.length) return fail_('Không có gì để lưu.');
    const cur = revs_(), base = b.revs || {};
    const conflict = files.filter(f => base[f] != null && String(base[f]) !== String(cur[f]));
    if (conflict.length && !b.force) return fail_('Nội dung vừa được sửa ở nơi khác (trên Google Sheet hoặc máy khác).', { conflict: conflict });
    const err = validate_(data);
    if (err) return fail_(err);
    files.forEach(f => { if (f === 'site') writeSettings_(data.site); else writeTable_(f, data[f]); });
    bump_(files);
    return { ok: true, revs: revs_() };
  }),
  upload: b => {
    const mime = String(b.mime || ''), name = str_(b.name, 120).replace(/[^\w.\-]+/g, '-') || 'anh.webp';
    if (!/^image\/(webp|jpeg|png|gif|avif)$/.test(mime)) return fail_('Định dạng ảnh không hỗ trợ.');
    const bytes = Utilities.base64Decode(String(b.b64 || ''));
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) return fail_('Ảnh rỗng hoặc lớn hơn 8MB.');
    const file = imageFolder_().createFile(Utilities.newBlob(bytes, mime, name));
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
    catch (e) { file.setTrashed(true); return fail_('Google Drive không cho chia sẻ ảnh công khai (tài khoản tổ chức có thể chặn). ' + e.message); }
    const img = { id: file.getId(), url: 'https://lh3.googleusercontent.com/d/' + file.getId(), name: name, folder: str_(b.folder, 30), size: bytes.length, createdAt: new Date() };
    withLock_(() => appendRow_('images', img));
    return { ok: true, id: img.id, url: img.url, size: img.size };
  },
  images: () => ({ ok: true, images: images_() }),
  deleteImage: b => withLock_(() => {
    const id = str_(b.id, 100), row = findRow_('images', 'id', v => v === id);
    if (!row) return fail_('Không tìm thấy ảnh.');
    try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {}       // vào Thùng rác Drive (khôi phục được trong 30 ngày)
    head_('images', false).sh.deleteRow(row);
    return { ok: true };
  }),
  orders: b => ({ ok: true, now: new Date().toISOString(), orders: readTable_('orders', { last: Math.min(Number(b.limit) || 500, 3000) }).map(orderOut_).reverse(),
    contacts: readTable_('contacts', { last: 300 }).map(clean_).reverse(), payments: readTable_('payments', { last: 100 }).map(clean_).reverse(),
    sepay: { on: !!prop_('SEPAY_TOKEN'), account: prop_('SEPAY_ACCOUNT'), lastSync: prop_('SEPAY_LAST_SYNC') || null, lastError: prop_('SEPAY_LAST_ERROR') || null } }),
  updateOrder: b => withLock_(() => {
    const code = str_(b.code, 40), row = findRow_('orders', 'code', v => v === code);
    if (!row) return fail_('Không tìm thấy đơn ' + code);
    const o = readRow_('orders', row), patch = { updatedAt: new Date() };
    if (b.status){ if (!FUL[b.status]) return fail_('Trạng thái không hợp lệ.'); patch.status = FUL[b.status]; }
    if (b.adminNote != null) patch.adminNote = str_(b.adminNote, 1000);
    if (b.markPaid){
      if (o.method !== METHOD.bank) return fail_('Đơn COD — không cần đánh dấu chuyển khoản.');
      patch.payState = PAY.paid; patch.paid = Math.max(o.paid || 0, o.total); patch.paidAt = new Date();
      patch.check = (o.check && o.check !== 'OK' ? o.check + ' · ' : '') + 'Xác nhận thanh toán thủ công';
    }
    updateRow_('orders', row, patch);
    return { ok: true, order: orderOut_(readRow_('orders', row)) };
  }),
  updateContact: b => withLock_(() => {
    const row = findRow_('contacts', 'id', v => v === String(b.id || ''));
    if (!row) return fail_('Không tìm thấy lời nhắn.');
    updateRow_('contacts', row, { handled: !!b.handled });
    return { ok: true };
  }),
  sync: () => { const r = syncPayments_(true); return Object.assign({ ok: r.ok !== false }, r); }
};
const FUL_CODE = {}; Object.keys(FUL).forEach(k => FUL_CODE[FUL[k]] = k);
const PAY_CODE = {}; Object.keys(PAY).forEach(k => PAY_CODE[PAY[k]] = k);
function orderOut_(o){
  const bank = o.method === METHOD.bank;
  return { id: o.code, code: o.code, createdAt: o.createdAt, updatedAt: o.updatedAt, fulfillment: FUL_CODE[o.status] || 'new',
    payment: { method: bank ? 'bank' : 'cod', state: bank ? (PAY_CODE[o.payState] || 'pending') : 'cod', paid: o.paid || 0, paidAt: o.paidAt, payCode: o.payCode, manual: /thủ công/.test(o.check || '') },
    customer: { name: o.name, phone: o.phone, email: o.email, address: o.address, province: o.province, ward: o.ward, street: o.street, note: o.note },
    items: Array.isArray(o.items) && o.items.length ? o.items : [{ name: o.itemsText, qty: '', price: 0, lineTotal: o.subtotal }],
    subtotal: o.subtotal, shipping: o.shipping, total: o.total, adminNote: o.adminNote, check: o.check, row: o._row };
}
function images_(){ return readTable_('images').map(clean_).reverse(); }
function imageFolder_(){
  const id = prop_('IMG_FOLDER');
  if (id){ try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder('NMN website · ảnh');
  props_().setProperty('IMG_FOLDER', f.getId());
  return f;
}
function validate_(d){
  const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if ('site' in d && (!d.site || typeof d.site !== 'object' || Array.isArray(d.site))) return 'Cài đặt không hợp lệ.';
  for (const f of ['products', 'posts', 'events']){
    if (!(f in d)) continue;
    if (!Array.isArray(d[f])) return SHEET[f] + ': dữ liệu không hợp lệ.';
    const seen = {};
    for (const it of d[f]){
      if (!it || typeof it !== 'object') return SHEET[f] + ': có mục không hợp lệ.';
      if (!slugRe.test(String(it.slug || ''))) return SHEET[f] + ': đường dẫn “' + it.slug + '” không hợp lệ.';
      if (seen[it.slug]) return SHEET[f] + ': đường dẫn “' + it.slug + '” bị trùng.';
      seen[it.slug] = 1;
      if (f === 'products' && !(Number(it.price) >= 0)) return 'Sản phẩm “' + (it.name || it.slug) + '”: giá không hợp lệ.';
    }
  }
  return '';
}

/* =====================================================================
   ĐIỂM VÀO WEB APP
   ===================================================================== */
function doGet(e){
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'content'){
      const c = content_();
      if (p.gen && p.gen === c.gen) return out_({ ok: true, gen: c.gen, same: true });
      return ContentService.createTextOutput('{"ok":true,"gen":' + JSON.stringify(c.gen) + ',"data":' + c.json + '}').setMimeType(ContentService.MimeType.JSON);
    }
    if (p.action === 'status') return out_(status_(p.code));
    return out_({ ok: true, service: 'nmn-website', version: VERSION });
  } catch (err) { console.error(err); return out_(fail_('Máy chủ gặp lỗi, vui lòng thử lại.')); }
}
function doPost(e){
  let b;
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out_(fail_('Dữ liệu không hợp lệ.')); }
  try {
    const a = String(b.action || (b.type === 'contact' ? 'contact' : b.items ? 'order' : ''));
    if (a === 'order') return out_(createOrder_(b));
    if (a === 'contact') return out_(createContact_(b));
    if (a.indexOf('admin.') === 0){
      const fn = ADMIN[a.slice(6)];
      if (!fn) return out_(fail_('Không rõ yêu cầu.'));
      const bad = auth_(b);
      if (bad) return out_(fail_(bad, { auth: true }));
      return out_(fn(b));
    }
    return out_(fail_('Không rõ yêu cầu.'));
  } catch (err) { console.error(err); return out_(fail_(err && err.message ? err.message : 'Máy chủ gặp lỗi.')); }
}

/* =====================================================================
   MENU TRÊN GOOGLE SHEET + CÀI ĐẶT
   ===================================================================== */
function onOpen(){
  SpreadsheetApp.getUi().createMenu('NMN Website')
    .addItem('① Cài đặt lần đầu', 'setup')
    .addItem('Thông tin kết nối (link + khoá quản trị)', 'showConnection')
    .addSeparator()
    .addItem('Làm mới website ngay (sau khi sửa trên Sheet)', 'refreshWebsite')
    .addItem('Đồng bộ thanh toán SePay ngay', 'syncNow')
    .addItem('Bật / tắt email báo đơn mới', 'toggleNotify')
    .addSeparator()
    .addItem('Nhập lại nội dung từ website (ghi đè)', 'importFromWebsite')
    .addItem('Tạo khoá quản trị mới', 'resetAdminKey')
    .addToUi();
}
/** Sửa trực tiếp trên Sheet → website nhận nội dung mới ngay (không cần chờ bộ nhớ đệm) */
function onEdit(e){
  try {
    const name = e && e.range && e.range.getSheet().getName();
    const f = CONTENT.find(k => SHEET[k] === name);
    if (f) bump_([f]);
  } catch (err) {}
}
function ui_(){ try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }
function say_(title, msg){ const ui = ui_(); if (ui) ui.alert(title, msg, ui.ButtonSet.OK); else console.log(title + '\n' + msg); }

function setup(){
  const ss = ss_();
  try { ss.setSpreadsheetTimeZone(TZ); } catch (e) {}
  const P = props_();
  if (!P.getProperty('ADMIN_KEY')) P.setProperty('ADMIN_KEY', randomKey_('nmn_'));
  if (!P.getProperty('NOTIFY_EMAIL')){ try { const me = Session.getEffectiveUser().getEmail(); if (me) P.setProperty('NOTIFY_EMAIL', me); } catch (e) {} }
  Object.keys(HEAD_MEMO).forEach(k => delete HEAD_MEMO[k]);
  // các bảng dữ liệu
  ['products', 'posts', 'events', 'orders', 'payments', 'contacts', 'images'].forEach(name => {
    const sh = sheet_(name, true);
    if (!sh.getLastColumn()){
      sh.getRange(1, 1, 2, SCHEMA[name].length).setValues([SCHEMA[name].map(f => f.l), SCHEMA[name].map(f => f.k)]);
      SCHEMA[name].forEach((f, i) => { if (f.w) sh.setColumnWidth(i + 1, f.w); });
    }
    const h = head_(name, true);
    styleHead_(sh, h.width);
    sh.setFrozenColumns(1);
  });
  const st = sheet_('site', true);
  if (!st.getLastRow()) st.getRange(1, 1, 1, 4).setValues([SET_HEAD]);
  st.setFrozenRows(1); st.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#13202a').setFontColor('#f7f2e8');
  st.setColumnWidth(1, 190); st.setColumnWidth(2, 420); st.setColumnWidth(3, 70); st.setColumnWidth(4, 300);
  // thứ tự trang tính
  ['orders', 'contacts', 'payments', 'products', 'site', 'posts', 'events', 'images'].forEach((n, i) => { const sh = sheet_(n, false); if (sh){ ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1); } });
  const blank = ss.getSheetByName('Sheet1') || ss.getSheetByName('Trang tính1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  // nội dung ban đầu: lấy từ website nếu Sheet còn trống
  let imported = '';
  if (!readTable_('products').length && !readSettings_().brand){
    try { importContent_(); imported = '\n✓ Đã nhập nội dung hiện có của website (sản phẩm, cài đặt, bài viết, sự kiện).'; }
    catch (e) { imported = '\n⚠ Chưa nhập được nội dung từ website: ' + e.message + ' — dùng menu “Nhập lại nội dung từ website” sau.'; }
  }
  installTriggers_();
  bump_(CONTENT);
  ss.setActiveSheet(sheet_('orders', false));
  showConnection('Cài đặt xong ✓' + imported);
}
function installTriggers_(){
  const has = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'syncPayments');
  if (!has) ScriptApp.newTrigger('syncPayments').timeBased().everyMinutes(1).create();
}
function importContent_(){
  const base = (prop_('SITE_URL') || DEFAULT_SITE_URL).replace(/\/?$/, '/');
  const get = f => {
    const r = UrlFetchApp.fetch(base + 'content/' + f + '.json?t=' + Date.now(), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error(base + 'content/' + f + '.json → HTTP ' + r.getResponseCode());
    return JSON.parse(r.getContentText());
  };
  const d = {}; CONTENT.forEach(f => d[f] = get(f));
  const err = validate_(d); if (err) throw new Error(err);
  withLock_(() => { writeSettings_(d.site); ['products', 'posts', 'events'].forEach(f => writeTable_(f, d[f])); });
  bump_(CONTENT);
}
function importFromWebsite(){
  const ui = ui_();
  if (ui && ui.alert('Nhập lại nội dung từ website?', 'Các trang tính Cài đặt, Sản phẩm, Bài viết, Sự kiện sẽ bị GHI ĐÈ bằng nội dung trong thư mục content/ của website. Đơn hàng, thanh toán, lời nhắn giữ nguyên.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  importContent_();
  say_('Đã nhập xong', 'Nội dung website đã được chép vào Google Sheet.');
}
function refreshWebsite(){ bump_(CONTENT); say_('Đã làm mới', 'Website sẽ hiển thị nội dung mới nhất trên Sheet (khách đang mở trang sẽ thấy sau khi tải lại).'); }
function syncNow(){
  const r = syncPayments_(true);
  say_('Đồng bộ SePay', r.ok === false ? r.error : 'Đã kiểm tra giao dịch: ' + (r.added || 0) + ' giao dịch mới, ' + (r.matched || 0) + ' khớp đơn hàng.');
}
function toggleNotify(){
  const P = props_(), cur = P.getProperty('NOTIFY_EMAIL');
  if (cur && cur !== 'off'){ P.setProperty('NOTIFY_EMAIL', 'off'); return say_('Đã tắt', 'Không gửi email khi có đơn hàng / lời nhắn mới.'); }
  let me = ''; try { me = Session.getEffectiveUser().getEmail(); } catch (e) {}
  if (!me) return say_('Chưa bật được', 'Đặt Script property NOTIFY_EMAIL = email nhận thông báo.');
  P.setProperty('NOTIFY_EMAIL', me); say_('Đã bật', 'Email thông báo sẽ gửi tới ' + me + '.');
}
function resetAdminKey(){
  const ui = ui_();
  if (ui && ui.alert('Tạo khoá quản trị mới?', 'Khoá cũ sẽ ngừng hoạt động ngay — mọi máy đang đăng nhập CMS phải nhập khoá mới.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  props_().setProperty('ADMIN_KEY', randomKey_('nmn_'));
  showConnection('Đã tạo khoá mới');
}
function showConnection(title){
  const key = prop_('ADMIN_KEY');
  let url = ''; try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  const deployed = /\/exec$/.test(url);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = '<div style="font:14px/1.5 Arial,sans-serif;color:#13202a">' +
    (typeof title === 'string' ? '<p style="white-space:pre-line"><b>' + esc(title) + '</b></p>' : '') +
    '<p><b>Khoá quản trị</b> (dùng để đăng nhập CMS & Quản lý đơn hàng — giữ bí mật):</p>' +
    '<input readonly value="' + esc(key) + '" onclick="this.select()" style="width:100%;padding:8px;font:13px monospace">' +
    '<p style="margin-top:14px"><b>Link Web App</b>:</p>' +
    (deployed ? '<input readonly value="' + esc(url) + '" onclick="this.select()" style="width:100%;padding:8px;font:12px monospace">'
      : '<p style="color:#8f4357">Chưa triển khai. Trong Apps Script: <b>Triển khai → Tùy chọn triển khai mới → Ứng dụng web</b>, Thực thi với tư cách <b>Tôi</b>, Người có quyền truy cập <b>Bất kỳ ai</b> → Triển khai → sao chép URL kết thúc bằng <code>/exec</code>.</p>') +
    '<p style="margin-top:14px;color:#555">Dán link Web App vào <code>assets/js/config.js</code> của website. SePay (tuỳ chọn): Project Settings → Script properties → <code>SEPAY_TOKEN</code>, <code>SEPAY_ACCOUNT</code>.</p></div>';
  const ui = ui_();
  if (ui) ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(deployed ? 360 : 400), 'NMN Website · Kết nối');
  else console.log('ADMIN_KEY: ' + key + '\nWeb App: ' + (url || '(chưa triển khai)'));
}
