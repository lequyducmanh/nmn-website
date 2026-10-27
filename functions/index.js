/**
 * NMN · Cloud Functions (Firebase, khu vực Singapore)
 * Một hàm HTTP "api", gắn vào website qua Firebase Hosting: /api/**
 *
 *   POST /api/orders    tạo đơn — tính lại tiền theo bảng giá trên website
 *   POST /api/contact   lưu lời nhắn từ trang Liên hệ
 *   GET  /api/status    trạng thái thanh toán của 1 đơn (dự phòng khi trình duyệt không nghe Firestore được)
 *   POST /api/sepay     webhook SePay: tiền vào tài khoản → cập nhật đơn ngay lập tức
 *
 * Firestore:
 *   orders/{code}      đơn hàng đầy đủ (chỉ quản trị viên đọc được)
 *   status/{payCode}   trạng thái thanh toán công khai theo mã — KHÔNG chứa thông tin khách
 *   payments/{id}      giao dịch ngân hàng từ SePay (chống trùng theo id)
 *   contacts/{id}      lời nhắn liên hệ
 *   config/sepay       { webhookKey, account } — đặt trong trang Quản lý đơn hàng
 *   admins/{email}     danh sách quản trị viên
 */
'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const crypto = require('crypto');
const core = require('./lib/core');

admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 10 });

const PROJECT = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
const SITE = process.env.SITE_URL || `https://${PROJECT}.web.app/`;

/* ---------- bộ nhớ đệm trong instance ---------- */
const memo = {};
async function cached(key, ttlMs, load, keep = () => true){
  const m = memo[key];
  if (m && m.exp > Date.now()) return m.val;
  const val = await load();
  if (keep(val)) memo[key] = { val, exp: Date.now() + ttlMs };
  return val;
}
const fetchJson = url => fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now()).then(r => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
const getCatalog = () => cached('catalog', 60e3, async () => {
  const [products, site] = await Promise.all([fetchJson(SITE + 'content/products.json'), fetchJson(SITE + 'content/site.json')]);
  return core.catalog(products, site);
});
const getSepay = () => cached('sepay', 30e3, async () => {
  const s = await db.doc('config/sepay').get();
  return s.exists ? s.data() : {};
}, v => !!v.webhookKey);                                    // chưa đặt khoá → không lưu đệm

/* ---------- giới hạn tần suất theo IP (băm, không lưu IP thật) ---------- */
async function rateLimit(req, kind, max, windowMs){
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  const id = kind + '_' + crypto.createHash('sha256').update(PROJECT + ip).digest('hex').slice(0, 32);
  const ref = db.doc('ratelimits/' + id);
  return db.runTransaction(async t => {
    const s = await t.get(ref), now = Date.now();
    const d = s.exists ? s.data() : { n: 0, start: now };
    if (now - d.start > windowMs){ d.n = 0; d.start = now; }
    if (d.n >= max) return false;
    t.set(ref, { n: d.n + 1, start: d.start, exp: new Date(d.start + windowMs) });
    return true;
  });
}

const send = (res, code, obj) => res.status(code).set('Cache-Control', 'no-store').json(obj);

/* ---------- POST /api/orders ---------- */
async function createOrder(req, res){
  if (!(await rateLimit(req, 'order', 15, 10 * 60e3))) return send(res, 429, { ok: false, error: 'Bạn đặt quá nhiều đơn trong thời gian ngắn, vui lòng thử lại sau ít phút.' });
  let cat;
  try { cat = await getCatalog(); } catch (e) { logger.error('catalog', e); return send(res, 503, { ok: false, error: 'Không tải được bảng giá.' }); }
  const r = core.buildOrder(req.body, cat);
  if (r.error) return send(res, 400, { ok: false, error: r.error });
  const o = r.order;
  for (let attempt = 0; attempt < 4; attempt++){
    const code = attempt === 0 && o.code ? o.code : core.newCode();
    const pc = core.payCode(code), now = FieldValue.serverTimestamp();
    try {
      await db.runTransaction(async t => {
        const ref = db.doc('orders/' + code), sref = db.doc('status/' + pc);
        const [a, b] = await Promise.all([t.get(ref), t.get(sref)]);
        if (a.exists || b.exists) throw Object.assign(new Error('exists'), { exists: true });
        t.create(ref, { ...o, code, payment: { ...o.payment, payCode: pc }, fulfillment: 'new', adminNote: '', source: 'web', createdAt: now, updatedAt: now });
        t.create(sref, { code, method: o.payment.method, state: o.payment.state, total: o.total, paid: 0, paidAt: null, createdAt: now, updatedAt: now });
      });
      if (o.clientTotal && o.clientTotal !== o.total) logger.warn('client total differs', { code, client: o.clientTotal, server: o.total });
      return send(res, 200, { ok: true, code, payCode: pc, subtotal: o.subtotal, shipping: o.shipping, total: o.total });
    } catch (e) {
      if (!e.exists){ logger.error('createOrder', e); return send(res, 500, { ok: false, error: 'Không lưu được đơn hàng.' }); }
    }
  }
  return send(res, 500, { ok: false, error: 'Không tạo được mã đơn.' });
}

/* ---------- POST /api/contact ---------- */
async function createContact(req, res){
  if (!(await rateLimit(req, 'contact', 8, 10 * 60e3))) return send(res, 429, { ok: false, error: 'Bạn gửi quá nhiều lời nhắn, vui lòng thử lại sau.' });
  const r = core.buildContact(req.body);
  if (r.error) return send(res, 400, { ok: false, error: r.error });
  const code = String((req.body && req.body.code) || '').slice(0, 24);
  const ref = await db.collection('contacts').add({ ...r.contact, code, createdAt: FieldValue.serverTimestamp() });
  return send(res, 200, { ok: true, id: ref.id });
}

/* ---------- GET /api/status?code= ---------- */
async function getStatus(req, res){
  const pc = core.payCode(req.query.code);
  if (!/^NMN\d{6}[A-Z0-9]{4,6}$/.test(pc)) return send(res, 400, { status: 'bad_code' });
  const s = await db.doc('status/' + pc).get();
  if (!s.exists) return send(res, 404, { status: 'not_found' });
  const d = s.data();
  return send(res, 200, { status: d.state === 'paid' ? 'paid' : d.state === 'cod' ? 'cod' : d.paid > 0 ? 'partial' : 'pending', paid: d.paid || 0, total: d.total || 0, at: d.paidAt && d.paidAt.toDate ? d.paidAt.toDate().toISOString() : null });
}

/* ---------- POST /api/sepay (webhook) ---------- */
async function sepayWebhook(req, res){
  const cfg = await getSepay();
  if (!cfg.webhookKey) return send(res, 503, { success: false, message: 'webhook key not configured' });
  const m = /^Apikey\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  if (!m || !core.safeEqual(m[1].trim(), cfg.webhookKey)) return send(res, 401, { success: false });
  const b = req.body || {};
  const id = String(b.id || '');
  if (!/^\d{1,20}$/.test(id)) return send(res, 400, { success: false, message: 'bad id' });
  const amount = Math.round(Number(b.transferAmount) || 0);
  const incoming = String(b.transferType || '').toLowerCase() === 'in' && amount > 0;
  const accountOk = !cfg.account || !b.accountNumber || String(b.accountNumber) === String(cfg.account);
  const candidates = incoming && accountOk ? core.payCodeCandidates(b.code, b.content) : [];

  const result = await db.runTransaction(async t => {
    const pref = db.doc('payments/' + id);
    const ps = await t.get(pref);
    if (ps.exists) return 'duplicate';                       // SePay gửi lại → không cộng 2 lần
    let st = null;
    for (const c of candidates){ const s = await t.get(db.doc('status/' + c)); if (s.exists){ st = s; break; } }
    const now = FieldValue.serverTimestamp();
    t.create(pref, {
      id, amount, incoming, accountOk,
      content: core.str(b.content, 500), code: b.code || null, gateway: core.str(b.gateway, 60), accountNumber: core.str(b.accountNumber, 30),
      transactionDate: core.str(b.transactionDate, 30), referenceCode: core.str(b.referenceCode, 60),
      payCode: st ? st.id : null, orderCode: st ? st.data().code : null, matched: !!st, createdAt: now
    });
    if (!st) return incoming ? 'unmatched' : 'ignored';
    const d = st.data(), next = core.applyPayment(d, amount);
    const paidAt = next.state === 'paid' ? now : null;
    t.update(st.ref, { paid: next.paid, state: next.state, paidAt, updatedAt: now });
    t.update(db.doc('orders/' + d.code), { 'payment.paid': next.paid, 'payment.state': next.state, 'payment.paidAt': paidAt, updatedAt: now });
    return next.state;
  });
  logger.info('sepay', { id, amount, result });
  return send(res, 200, { success: true });                 // SePay yêu cầu đúng {"success": true}
}

/* ---------- router ---------- */
async function handler(req, res){
  const path = String(req.path || req.url || '').replace(/^\/api/, '').split('?')[0].replace(/\/+$/, '') || '/';
  try {
    if (req.method === 'POST' && path === '/orders') return await createOrder(req, res);
    if (req.method === 'POST' && path === '/contact') return await createContact(req, res);
    if (req.method === 'GET' && path === '/status') return await getStatus(req, res);
    if (req.method === 'POST' && path === '/sepay') return await sepayWebhook(req, res);
    if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true });
    return send(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    logger.error('api', e);
    return send(res, 500, { ok: false, error: 'server error' });
  }
}

exports.api = onRequest({ memory: '256MiB', timeoutSeconds: 30, invoker: 'public' }, handler);
exports._handler = handler;   // dùng cho kiểm thử
