/**
 * NMN website · Google Apps Script (gắn với 1 Google Sheet)
 * ------------------------------------------------------------------
 *  POST  (từ website)            → lưu ĐƠN HÀNG vào trang tính "Đơn hàng"
 *  POST  type = "contact"        → lưu LỜI NHẮN vào trang tính "Liên hệ"
 *  GET   ?action=status&code=…   → trạng thái thanh toán của 1 đơn (trang xác nhận đơn hỏi mỗi vài giây)
 *  syncPayments()                → đối soát giao dịch với SePay (chạy mỗi phút bằng Trigger)
 *
 *  Xác nhận chuyển khoản dùng API chính thức của SePay (không cần webhook):
 *  chỉ giao dịch có thật trong tài khoản ngân hàng mới được tính.
 *  Tổng tiền đơn được TÍNH LẠI từ bảng giá trên website (không tin số tiền trình duyệt gửi lên).
 *
 *  CÀI ĐẶT (xem README → "Xác nhận chuyển khoản tự động"):
 *  Project Settings → Script properties:
 *    SITE_URL       https://lequyducmanh.github.io/nmn-website/   (bắt buộc để tính lại tổng tiền)
 *    SEPAY_TOKEN    API token tạo ở my.sepay.vn → Cấu hình công ty → API Access
 *    SEPAY_ACCOUNT  Số tài khoản nhận tiền (để lọc đúng tài khoản)
 *  Triggers → Add trigger → syncPayments · Time-driven · Every minute
 */

const ORDER_SHEET = 'Đơn hàng', PAY_SHEET = 'Thanh toán', CONTACT_SHEET = 'Liên hệ';
const ORDER_HEAD = ['Mã đơn', 'Thời gian', 'Họ tên', 'SĐT', 'Email', 'Tỉnh/TP', 'Địa chỉ', 'Sản phẩm', 'Tạm tính', 'Phí ship', 'Tổng',
                    'Thanh toán', 'Ghi chú', 'Nội dung CK', 'Đã nhận', 'Trạng thái thanh toán', 'Kiểm tra'];
const PAY_HEAD = ['ID giao dịch SePay', 'Thời gian', 'Số tiền', 'Nội dung', 'Mã đơn', 'Ngân hàng', 'Số tham chiếu'];
const CONTACT_HEAD = ['Mã', 'Thời gian', 'Họ tên', 'SĐT', 'Email', 'Chủ đề', 'Sản phẩm', 'Nội dung'];
const C_CODE = 1, C_TOTAL = 11, C_PAYTYPE = 12, C_PAYCODE = 14, C_PAID = 15, C_STATUS = 16, C_CHECK = 17;   // cột (1-based)
const ST_WAIT = 'Chờ thanh toán', ST_PART = 'Thiếu tiền', ST_PAID = 'Đã thanh toán';

/* ---------------- helpers ---------------- */
function props_(){ return PropertiesService.getScriptProperties(); }
function out_(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function payCode_(code){ return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function clean_(s){ return s == null ? '' : typeof s === 'string' && /^[=+\-@]/.test(s) ? "'" + s : s; }   // chặn công thức trong ô (chỉ với chữ)
function sheet_(name, head){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(head);
  else if (sh.getLastColumn() < head.length) sh.getRange(1, 1, 1, head.length).setValues([head]);   // nâng cấp tiêu đề cột cũ
  return sh;
}
function rows_(sh){ const n = sh.getLastRow() - 1; return n > 0 ? sh.getRange(2, 1, n, Math.max(sh.getLastColumn(), ORDER_HEAD.length)).getValues() : []; }

/** Bảng giá + phí ship từ website (cache 10 phút) → tính lại tổng tiền phía máy chủ */
function catalog_(){
  const cache = CacheService.getScriptCache(), hit = cache.get('catalog');
  if (hit) return JSON.parse(hit);
  const base = (props_().getProperty('SITE_URL') || '').replace(/\/?$/, '/');
  if (base === '/') return null;
  try {
    const P = JSON.parse(UrlFetchApp.fetch(base + 'content/products.json?t=' + Date.now(), { muteHttpExceptions: true }).getContentText());
    const S = JSON.parse(UrlFetchApp.fetch(base + 'content/site.json?t=' + Date.now(), { muteHttpExceptions: true }).getContentText());
    const c = { price: {}, name: {}, ship: S.shippingFee == null ? null : Number(S.shippingFee), free: S.freeShippingFrom == null ? null : Number(S.freeShippingFrom) };
    P.forEach(p => { if (p.visible !== false){ c.price[p.slug] = Number(p.price) || 0; c.name[p.slug] = p.name; } });
    cache.put('catalog', JSON.stringify(c), 600);
    return c;
  } catch (err) { return null; }
}
function serverTotals_(o){
  const c = catalog_(); if (!c) return null;
  let sub = 0;
  for (const i of (o.items || [])){
    const q = Math.max(1, Math.min(99, parseInt(i.qty, 10) || 0));
    if (!(i.slug in c.price)) return { error: 'Sản phẩm không có trên website: ' + i.slug };
    sub += c.price[i.slug] * q;
  }
  let ship = c.ship; if (c.free != null && sub >= c.free) ship = 0;
  return { sub: sub, ship: ship, total: sub + (ship || 0) };
}

/* ---------------- POST: đơn hàng / lời nhắn ---------------- */
function doPost(e){
  let o; try { o = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad json' }); }

  if (o.type === 'contact'){
    const sh = sheet_(CONTACT_SHEET, CONTACT_HEAD);
    sh.appendRow([o.code, new Date(o.createdAt || Date.now()), o.name, "'" + (o.phone || ''), o.email, o.topic, o.product, o.message].map(clean_));
    return out_({ ok: true });
  }

  if (!o.code || !o.customer || !Array.isArray(o.items)) return out_({ ok: false, error: 'missing fields' });
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const sh = sheet_(ORDER_SHEET, ORDER_HEAD);
    if (rows_(sh).some(r => String(r[C_CODE - 1]) === String(o.code))) return out_({ ok: true, duplicate: true });
    const t = serverTotals_(o);
    const total = t && !t.error ? t.total : Number(o.total) || 0;
    const check = !t ? 'Chưa đặt SITE_URL — tổng tiền theo trình duyệt' : t.error ? '⚠ ' + t.error : (t.total !== Number(o.total) ? '⚠ Tổng tiền được tính lại theo bảng giá (trình duyệt gửi ' + o.total + ')' : 'OK');
    const bank = o.payment === 'bank';
    sh.appendRow([
      o.code, new Date(o.createdAt || Date.now()), o.customer.name, "'" + (o.customer.phone || ''), o.customer.email,
      o.customer.city, o.customer.address, o.items.map(i => i.name + ' × ' + i.qty).join(', '),
      t && !t.error ? t.sub : o.subtotal, (t && !t.error ? t.ship : o.shipping) == null ? 'Báo sau' : (t && !t.error ? t.ship : o.shipping), total,
      bank ? 'Chuyển khoản' : 'COD', o.customer.note, bank ? payCode_(o.code) : '', bank ? 0 : '', bank ? ST_WAIT : '', check
    ].map(clean_));
    return out_({ ok: true, total: total });
  } finally { lock.releaseLock(); }
}

/* ---------------- GET: trạng thái thanh toán ---------------- */
function doGet(e){
  const p = (e && e.parameter) || {};
  if (p.action !== 'status') return out_({ ok: true, service: 'nmn-orders' });
  const code = String(p.code || '');
  if (!/^[A-Z0-9-]{6,32}$/i.test(code)) return out_({ status: 'bad_code' });
  let r = findOrder_(code);
  if (!r) return out_({ status: 'not_found' });
  if (r.type !== 'Chuyển khoản') return out_({ status: 'cod' });
  if (r.status !== ST_PAID){
    if (!props_().getProperty('SEPAY_TOKEN')) return out_({ status: 'off' });
    syncPayments_(false);
    r = findOrder_(code);
  }
  // chỉ trả trạng thái — không trả thông tin khách hàng
  return out_({ status: r.status === ST_PAID ? 'paid' : r.paid > 0 ? 'partial' : 'pending', paid: r.paid, total: r.total, at: r.at || null });
}
function findOrder_(code){
  const sh = sheet_(ORDER_SHEET, ORDER_HEAD), pc = payCode_(code);
  const data = rows_(sh);
  for (let i = data.length - 1; i >= 0; i--){
    const r = data[i];
    if (String(r[C_CODE - 1]) === code || payCode_(r[C_CODE - 1]) === pc){
      return { row: i + 2, type: String(r[C_PAYTYPE - 1]), total: Number(r[C_TOTAL - 1]) || 0, paid: Number(r[C_PAID - 1]) || 0, status: String(r[C_STATUS - 1]), at: props_().getProperty('PAID_AT_' + pc) };
    }
  }
  return null;
}

/* ---------------- đối soát với SePay ---------------- */
function syncPayments(){ syncPayments_(true); }          // chạy bằng Trigger mỗi phút
function syncPayments_(force){
  const P = props_(), token = P.getProperty('SEPAY_TOKEN');
  if (!token) return;
  const cache = CacheService.getScriptCache();
  if (!force && cache.get('synced')) return;               // nhiều khách cùng hỏi: tối đa 1 lần gọi SePay / 6 giây
  cache.put('synced', '1', 6);
  const lock = LockService.getScriptLock(); if (!lock.tryLock(8000)) return;
  try {
    const acc = P.getProperty('SEPAY_ACCOUNT') || '', lastId = Number(P.getProperty('LAST_TX_ID') || 0);
    let url = 'https://my.sepay.vn/userapi/transactions/list?limit=1000' + (acc ? '&account_number=' + encodeURIComponent(acc) : '');
    if (lastId) url += '&since_id=' + (lastId + 1);
    else url += '&transaction_date_min=' + Utilities.formatDate(new Date(Date.now() - 3 * 864e5), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return;
    const txs = (JSON.parse(res.getContentText()).transactions || []).sort((a, b) => Number(a.id) - Number(b.id));
    if (!txs.length) return;

    const pay = sheet_(PAY_SHEET, PAY_HEAD);
    const seen = new Set(pay.getLastRow() > 1 ? pay.getRange(2, 1, pay.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : []);
    const osh = sheet_(ORDER_SHEET, ORDER_HEAD), orders = rows_(osh);
    const open = [];                                      // đơn chuyển khoản chưa đủ tiền
    orders.forEach((r, i) => { if (String(r[C_PAYTYPE - 1]) === 'Chuyển khoản' && String(r[C_STATUS - 1]) !== ST_PAID) open.push({ i: i, pc: String(r[C_PAYCODE - 1] || payCode_(r[C_CODE - 1])) }); });
    let maxId = lastId;

    txs.forEach(tx => {
      const id = String(tx.id); maxId = Math.max(maxId, Number(tx.id) || 0);
      const amount = Math.round(Number(tx.amount_in) || 0);
      if (seen.has(id) || amount <= 0) return;
      const hay = [tx.code, tx.transaction_content].map(x => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
      const hit = open.find(o => o.pc && hay.some(h => h.indexOf(o.pc) >= 0));
      pay.appendRow([id, tx.transaction_date, amount, tx.transaction_content, hit ? orders[hit.i][C_CODE - 1] : '', tx.bank_brand_name, tx.reference_number].map(clean_));
      seen.add(id);
      if (!hit) return;
      const r = orders[hit.i], paid = (Number(r[C_PAID - 1]) || 0) + amount, total = Number(r[C_TOTAL - 1]) || 0;
      const st = paid >= total ? ST_PAID : ST_PART;
      r[C_PAID - 1] = paid; r[C_STATUS - 1] = st;
      osh.getRange(hit.i + 2, C_PAID, 1, 2).setValues([[paid, st]]);
      if (st === ST_PAID){ P.setProperty('PAID_AT_' + hit.pc, new Date().toISOString()); open.splice(open.indexOf(hit), 1); }
    });
    P.setProperty('LAST_TX_ID', String(maxId));
  } finally { lock.releaseLock(); }
}
