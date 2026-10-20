const VER = '0.1.0', BN = '০১২৩৪৫৬৭৮৯';
const $ = s => document.querySelector(s);
const h = (t, p = {}, ...k) => { const e = document.createElement(t); for (const [a, v] of Object.entries(p)) { if (a.startsWith('on')) e.addEventListener(a.slice(2), v); else if (a === 'class') e.className = v; else if (v != null && v !== false) e.setAttribute(a, v === true ? '' : v); } e.append(...k.flat(9).filter(x => x != null && x !== false)); return e; };
const LS = (k, v) => v === undefined ? JSON.parse(localStorage.getItem('sh_' + k) || 'null') : localStorage.setItem('sh_' + k, JSON.stringify(v));
const bn = s => String(s).replace(/\d/g, d => BN[d]);
const nrm = s => String(s).replace(/[০-৯]/g, d => BN.indexOf(d)).replace(/[,৳\s]/g, '').replace('٫', '.');
const P = s => Math.round(parseFloat(nrm(s)) * 100);
const cents = x => Math.round(Number(x) * 100);
const money = p => (p < 0 ? '-' : '') + '৳' + new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 2 }).format(Math.abs(p) / 100);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
const dfmt = d => d ? new Intl.DateTimeFormat('bn-BD', { dateStyle: 'long', timeZone: 'Asia/Dhaka' }).format(new Date(d + 'T12:00:00+06:00')) : '';
const tfmt = t => t ? new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' }).format(t) : 'এখনও হয়নি';
const act = a => (a || []).filter(r => r.status !== 'void');
const MSG = { unauthorized: 'অনুমতি নেই — আবার পেয়ার করুন', busy: 'সার্ভার ব্যস্ত', customer_not_found: 'কাস্টমার পাওয়া যায়নি', date_invalid: 'তারিখ ঠিক নয়', amount_invalid: 'টাকার অঙ্ক ঠিক নয়', id_conflict: 'এই এন্ট্রি আগেই আছে', items_invalid: 'পণ্যের তালিকা ঠিক নয়', method_invalid: 'পেমেন্টের মাধ্যম ঠিক নয়' };
const CATS = ['নাস্তা', 'কারিগর', 'কাটিং মাস্টার', 'ভাড়া', 'ট্রান্সপোর্ট', 'সাব্লিমেশন', 'এমব্রডায়রি', 'বেতন', 'পারচেজ', 'ক্যাশ আউট', 'মেশিন সার্ভিসিং', 'অন্যান্য'];
const METH = [['cash', 'নগদ'], ['bank', 'ব্যাংক'], ['bkash', 'বিকাশ'], ['nagad', 'নগদ (Nagad)'], ['other', 'অন্যান্য']];
const KIND = [['suggestion', 'পরামর্শ'], ['bug', 'সমস্যা'], ['praise', 'ভালো লেগেছে'], ['question', 'প্রশ্ন']];

let cfg = LS('cfg') || {}, snap = LS('snap') || { tables: {}, at: null }, box = LS('box') || [], bad = LS('bad') || [];
const S = { conn: 'idle', busy: false, err: '' };

/* ---------- UI helpers ---------- */
function toast(m, err) { const t = $('#toast'); t.textContent = m; t.className = 'show' + (err ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => t.className = '', 2600); }
const go = (p, replace) => replace ? location.replace('#/' + p) : (location.hash = '#/' + p);
const back = () => history.length > 1 ? history.back() : go('', true);
const fld = (l, el) => h('label', { class: 'f' }, h('span', {}, l), el);
const btn = (l, f, c = '') => h('button', { type: 'button', class: 'btn ' + c, onclick: f }, l);
const inp = (p = {}) => h('input', { autocomplete: 'off', ...p });
const empty = (m, l, to) => h('div', { class: 'empty' }, h('p', {}, m), l && btn(l, () => go(to)));
function chips(opts, val, on) { const b = h('div', { class: 'chips' }); const d = () => b.replaceChildren(...opts.map(([v, l]) => h('button', { type: 'button', class: 'chip' + (v === val ? ' on' : ''), onclick: () => { val = v; on && on(v); d(); } }, l))); d(); b.get = () => val; return b; }
function ask(msg, cb) { const t = h('textarea', { placeholder: 'কারণ' }); const d = h('dialog', {}, h('p', {}, msg), t, h('div', { class: 'btns' }, btn('ফিরে যান', () => { d.close(); d.remove(); }, 'ghost'), btn('বাতিল নিশ্চিত করুন', () => { if (!t.value.trim()) return toast('কারণ লিখুন', 1); d.close(); d.remove(); cb(t.value.trim()); }))); document.body.append(d); d.showModal(); t.focus(); }
const pick = (el, f) => e => f(e);

/* ---------- data ---------- */
function save(entity, payload, op = 'create', id) {
  const o = { op_id: crypto.randomUUID(), entity, entity_id: id || crypto.randomUUID(), op, base_version: null, client_created_at: new Date().toISOString(), payload };
  box.push(o); LS('box', box); strip(); sync(); return o.entity_id;
}
function local(t, op) {
  const k = op.entity + 's'; t[k] = t[k] || [];
  if (op.op === 'create') {
    const p = { ...op.payload, id: op.entity_id, status: 'active' };
    const c = (t.customers || []).find(x => x.id === p.customer_id); if (c) p.customer_name = c.name;
    if (op.entity === 'order') p.total = p.items.reduce((s, i) => s + i.quantity * cents(i.rate), 0) / 100;
    t[k].push(p);
  } else { const r = t[k].find(x => x.id === op.entity_id); if (r) { r.status = 'void'; r.void_reason = op.payload.reason; } }
}
function view() { const t = {}; for (const k in snap.tables) t[k] = snap.tables[k].map(r => ({ ...r })); box.forEach(o => local(t, o)); return t; }
function stats(t) {
  const by = {}; act(t.customers).forEach(c => by[c.id] = { c, sales: 0, paid: 0 });
  act(t.orders).forEach(r => by[r.customer_id] && (by[r.customer_id].sales += cents(r.total)));
  act(t.payments).forEach(r => by[r.customer_id] && (by[r.customer_id].paid += cents(r.amount)));
  Object.values(by).forEach(x => x.due = x.sales - x.paid); return by;
}

/* ---------- sync + connection ---------- */
async function call(action, extra = {}) {
  const c = new AbortController(), to = setTimeout(() => c.abort(), 30000);
  try {
    const r = await fetch(cfg.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: cfg.token, action, ...extra }), redirect: 'follow', signal: c.signal });
    const j = await r.json(); if (!j.ok) throw Object.assign(new Error(MSG[j.error] || j.message || j.error), { code: j.error }); return j;
  } finally { clearTimeout(to); }
}
async function sync(manual) {
  if (S.busy) return; if (!cfg.api) { if (manual) toast('আগে পেয়ার করুন', 1); return; }
  if (!navigator.onLine) { S.conn = 'offline'; strip(); return; }
  S.busy = true; S.conn = 'checking'; strip();
  try {
    while (box.length) {
      const r = await call('push', { device_id: cfg.dev, app_version: VER, ops: box.slice(0, 25) });
      r.results.forEach(x => { const i = box.findIndex(o => o.op_id === x.op_id); if (i < 0) return; if (x.status === 'rejected') bad.push({ ...box[i], err: MSG[x.code] || x.code }); box.splice(i, 1); });
      LS('box', box); LS('bad', bad);
    }
    const s = await call('snapshot'); snap = { tables: s.tables, at: Date.now() }; LS('snap', snap);
    S.conn = 'ok'; S.err = ''; if (manual) toast('সিঙ্ক সম্পন্ন');
  } catch (e) { S.conn = e.code === 'unauthorized' ? 'auth' : 'error'; S.err = e.message; if (manual) toast('সিঙ্ক হয়নি: ' + e.message, 1); }
  S.busy = false; strip(); refresh();
}
function strip() {
  const st = navigator.onLine ? S.conn : 'offline';
  const m = { ok: ['ok', 'সংযুক্ত — Google Sheet-এর সাথে যুক্ত'], checking: ['wait', 'সংযোগ যাচাই হচ্ছে…'], offline: ['off', 'অফলাইন — ডেটা ফোনে জমা হচ্ছে'], auth: ['bad', 'অনুমতি নেই — আবার পেয়ার করুন'], error: ['bad', 'সংযোগ হয়নি — আবার চেষ্টা হবে'], idle: ['off', cfg.api ? 'সংযোগ যাচাই হয়নি' : 'পেয়ার করা হয়নি'] }[st] || ['off', '?'];
  $('#strip').replaceChildren(h('b', {}, h('span', { class: 'dot ' + m[0] }), m[1]), h('span', { class: box.length ? 'neg' : 'mu' }, 'সিঙ্ক বাকি: ' + bn(box.length)), h('span', { class: 'mu' }, 'শেষ সিঙ্ক: ' + tfmt(snap.at)), h('button', { class: 'btn s', onclick: () => sync(true), disabled: S.busy }, S.busy ? 'সিঙ্ক হচ্ছে…' : 'এখনই সিঙ্ক'));
}

/* ---------- screens: each returns [title, node] ---------- */
function home() {
  const t = view(), st = Object.values(stats(t)), td = today();
  const sales = st.reduce((s, x) => s + x.sales, 0), paid = st.reduce((s, x) => s + x.paid, 0), ex = act(t.expenses);
  const sum = f => ex.filter(f).reduce((s, e) => s + cents(e.amount), 0);
  const rec = [...act(t.orders).map(r => ({ d: r.order_date, k: 'অর্ডার', n: r.customer_name, a: cents(r.total) })), ...act(t.payments).map(r => ({ d: r.paid_on, k: 'পেমেন্ট', n: r.customer_name, a: cents(r.amount) })), ...ex.map(r => ({ d: r.expense_date, k: 'খরচ', n: r.category, a: cents(r.amount) }))].sort((a, b) => b.d > a.d ? 1 : -1).slice(0, 10);
  const dues = st.filter(x => x.due > 0).sort((a, b) => b.due - a.due).slice(0, 5);
  const S4 = (l, v, c = '') => h('div', { class: 'stat ' + c }, h('span', { class: 'mu' }, l), h('b', {}, v));
  return ['হোম', h('div', {},
    h('div', { class: 'btns' }, btn('＋ অর্ডার', () => go('order/new')), btn('＋ পেমেন্ট', () => go('payment/new')), btn('＋ খরচ', () => go('expense/new'))),
    h('div', { class: 'grid' }, S4('মোট বিক্রি', money(sales)), S4('মোট আদায়', money(paid), 'g'), S4('মোট বাকি', money(sales - paid), 'r'), S4('আজকের খরচ', money(sum(e => e.expense_date === td))), S4('এই মাসের খরচ', money(sum(e => String(e.expense_date).slice(0, 7) === td.slice(0, 7))))),
    h('h2', {}, 'বাকি আছে (সর্বোচ্চ ৫)'), h('div', { class: 'card' }, dues.length ? dues.map(x => h('div', { class: 'row tap', onclick: pick(0, () => go('customer/' + x.c.id)) }, h('span', {}, x.c.name), h('b', { class: 'neg' }, money(x.due)))) : h('div', { class: 'empty' }, 'কোনো বাকি নেই')),
    h('h2', {}, 'সাম্প্রতিক লেনদেন'), h('div', { class: 'card' }, rec.length ? rec.map(r => h('div', { class: 'row' }, h('span', {}, h('b', {}, r.k), ' · ' + (r.n || ''), h('br'), h('small', { class: 'mu' }, dfmt(r.d))), h('b', {}, money(r.a)))) : empty('এখনও কোনো এন্ট্রি নেই', '＋ কাস্টমার যোগ করুন', 'customer/new'))
  )];
}
function customers() {
  const t = view(), st = Object.values(stats(t)), list = h('div', { class: 'card' });
  const q = inp({ type: 'search', placeholder: 'নাম বা ফোন দিয়ে খুঁজুন' });
  const draw = () => { const k = nrm(q.value).toLowerCase(), r = st.filter(x => !k || (x.c.name + ' ' + nrm(x.c.phone)).toLowerCase().includes(k)); list.replaceChildren(...(r.length ? r.map(x => h('div', { class: 'row tap', onclick: pick(0, () => go('customer/' + x.c.id)) }, h('span', {}, h('b', {}, x.c.name), h('br'), h('small', { class: 'mu' }, x.c.phone)), h('span', { class: x.due > 0 ? 'neg' : 'pos' }, money(x.due)))) : [empty(st.length ? 'কিছু পাওয়া যায়নি' : 'এখনও কোনো কাস্টমার নেই')])); };
  q.addEventListener('input', draw); draw();
  return ['কাস্টমার', h('div', {}, btn('＋ নতুন কাস্টমার', () => go('customer/new')), h('div', { class: 'f' }), q, h('div', { class: 'f' }), list)];
}
function custForm() {
  const n = inp({ placeholder: 'নাম', maxlength: 120 }), ph = inp({ inputmode: 'tel', placeholder: 'ফোন' }), ad = inp({ placeholder: 'ঠিকানা' }), no = h('textarea', { placeholder: 'নোট' });
  return ['নতুন কাস্টমার', h('div', { class: 'card' }, fld('নাম *', n), fld('ফোন', ph), fld('ঠিকানা', ad), fld('নোট', no), btn('সংরক্ষণ করুন', () => { if (!n.value.trim()) return toast('নাম লিখুন', 1); go('customer/' + save('customer', { name: n.value, phone: ph.value, address: ad.value, notes: no.value }), true); }))];
}
function custView(q, id) {
  const t = view(), x = stats(t)[id]; if (!x) return ['কাস্টমার', empty('কাস্টমার পাওয়া যায়নি', 'তালিকায় যান', 'customers')];
  const vb = (en, rid) => h('button', { class: 'btn s ghost', onclick: () => ask('বাতিলের কারণ লিখুন', r => { save(en, { reason: r }, 'void', rid); refresh(1); }) }, 'বাতিল');
  const os = act(t.orders).filter(r => r.customer_id === id).sort((a, b) => b.order_date > a.order_date ? 1 : -1), ps = act(t.payments).filter(r => r.customer_id === id).sort((a, b) => b.paid_on > a.paid_on ? 1 : -1);
  return [x.c.name, h('div', {},
    h('div', { class: 'card' }, h('div', {}, '📞 ' + (x.c.phone || '—')), h('div', {}, '📍 ' + (x.c.address || '—')), x.c.notes && h('div', { class: 'mu' }, x.c.notes)),
    h('div', { class: 'grid' }, h('div', { class: 'stat' }, h('span', { class: 'mu' }, 'মোট বিক্রি'), h('b', {}, money(x.sales))), h('div', { class: 'stat g' }, h('span', { class: 'mu' }, 'মোট আদায়'), h('b', {}, money(x.paid))), h('div', { class: 'stat r' }, h('span', { class: 'mu' }, 'বাকি'), h('b', {}, money(x.due)))),
    h('div', { class: 'btns' }, btn('＋ অর্ডার', () => go('order/new?c=' + id)), btn('＋ পেমেন্ট', () => go('payment/new?c=' + id))),
    h('h2', {}, 'অর্ডার'), h('div', { class: 'card' }, os.length ? os.map(r => h('div', { class: 'row' }, h('span', {}, h('b', {}, 'মেমো ' + (r.memo_no || '—')), h('br'), h('small', { class: 'mu' }, dfmt(r.order_date))), h('b', {}, money(cents(r.total))), vb('order', r.id))) : h('div', { class: 'empty' }, 'কোনো অর্ডার নেই')),
    h('h2', {}, 'পেমেন্ট'), h('div', { class: 'card' }, ps.length ? ps.map(r => h('div', { class: 'row' }, h('span', {}, h('b', {}, (METH.find(m => m[0] === r.method) || [0, r.method])[1]), h('br'), h('small', { class: 'mu' }, dfmt(r.paid_on))), h('b', { class: 'pos' }, money(cents(r.amount))), vb('payment', r.id))) : h('div', { class: 'empty' }, 'কোনো পেমেন্ট নেই')))];
}
function custSelect(t, sel) { return h('select', {}, ...act(t.customers).map(c => h('option', { value: c.id, selected: c.id === sel }, c.name))); }
function orderForm(q) {
  const t = view(); if (!act(t.customers).length) return ['নতুন অর্ডার', empty('আগে একজন কাস্টমার যোগ করুন', '＋ কাস্টমার', 'customer/new')];
  const cs = custSelect(t, q.c), dt = inp({ type: 'date', value: today() }), memo = inp({ placeholder: 'মেমো নম্বর' }), no = h('textarea', { placeholder: 'নোট' }), rows = h('div'), tot = h('div', { class: 'big' }), lines = [];
  const calc = () => { const s = lines.reduce((a, l) => a + (parseInt(nrm(l.q.value)) || 0) * (P(l.r.value) || 0), 0); tot.textContent = 'মোট: ' + money(s); };
  const add = () => { const l = { p: inp({ placeholder: 'পণ্য' }), q: inp({ inputmode: 'numeric', placeholder: 'পরিমাণ' }), r: inp({ inputmode: 'decimal', placeholder: 'রেট ৳' }) }; [l.q, l.r].forEach(e => e.addEventListener('input', calc)); l.el = h('div', { class: 'line' }, l.p, l.q, l.r, h('button', { type: 'button', class: 'x', 'aria-label': 'সরান', onclick: () => { if (lines.length > 1) { lines.splice(lines.indexOf(l), 1); l.el.remove(); calc(); } } }, '✕')); lines.push(l); rows.append(l.el); }; add(); calc();
  return ['নতুন অর্ডার', h('div', { class: 'card' }, fld('কাস্টমার', cs), fld('তারিখ', dt), fld('মেমো নম্বর', memo), h('h2', {}, 'পণ্য'), rows, btn('＋ আরেকটি পণ্য', add, 'ghost'), tot, fld('নোট', no), btn('অর্ডার সংরক্ষণ', () => {
    const items = lines.map(l => ({ product: l.p.value.trim(), quantity: parseInt(nrm(l.q.value)), rate: P(l.r.value) / 100 }));
    if (items.some(i => !i.product || !Number.isInteger(i.quantity) || i.quantity < 1 || !(i.rate >= 0))) return toast('পণ্য, পরিমাণ ও রেট ঠিকভাবে লিখুন', 1);
    save('order', { customer_id: cs.value, order_date: dt.value, memo_no: nrm(memo.value), notes: no.value, items }); toast('অর্ডার সংরক্ষিত'); go('customer/' + cs.value, true);
  }))];
}
function payForm(q) {
  const t = view(), S = stats(t); if (!act(t.customers).length) return ['নতুন পেমেন্ট', empty('আগে একজন কাস্টমার যোগ করুন', '＋ কাস্টমার', 'customer/new')];
  const cs = custSelect(t, q.c), am = inp({ inputmode: 'decimal', placeholder: '৳' }), dt = inp({ type: 'date', value: today() }), no = h('textarea', { placeholder: 'নোট' }), info = h('div', { class: 'big' }), m = chips(METH, 'cash');
  const upd = () => { const d = (S[cs.value] || { due: 0 }).due, a = P(am.value) || 0; info.replaceChildren('বর্তমান বাকি: ' + money(d), h('br'), 'পেমেন্টের পরে: ', h('span', { class: d - a < 0 ? 'neg' : 'pos' }, money(d - a)), d - a < 0 ? h('div', { class: 'neg' }, '⚠ অতিরিক্ত পেমেন্ট') : ''); };
  cs.addEventListener('change', upd); am.addEventListener('input', upd); upd();
  return ['নতুন পেমেন্ট', h('div', { class: 'card' }, fld('কাস্টমার', cs), info, fld('টাকার অঙ্ক', am), fld('মাধ্যম', m), fld('তারিখ', dt), fld('নোট', no), btn('পেমেন্ট সংরক্ষণ', () => {
    const a = P(am.value) / 100; if (!(a > 0)) return toast('টাকার অঙ্ক ঠিক নয়', 1);
    save('payment', { customer_id: cs.value, amount: a, method: m.get(), paid_on: dt.value, notes: no.value }); toast('পেমেন্ট সংরক্ষিত'); go('customer/' + cs.value, true);
  }))];
}
function expenses() {
  const ex = act(view().expenses).sort((a, b) => b.expense_date > a.expense_date ? 1 : -1), g = {}; ex.forEach(e => (g[e.expense_date] = g[e.expense_date] || []).push(e));
  return ['খরচ', h('div', {}, btn('＋ নতুন খরচ', () => go('expense/new')), h('div', { class: 'f' }), ex.length ? Object.keys(g).map(d => h('div', { class: 'card' }, h('b', {}, dfmt(d) + ' — ' + money(g[d].reduce((s, e) => s + cents(e.amount), 0))), g[d].map(e => h('div', { class: 'row' }, h('span', {}, e.category, h('br'), h('small', { class: 'mu' }, e.description)), h('b', {}, money(cents(e.amount))), h('button', { class: 'btn s ghost', onclick: () => ask('খরচ বাতিলের কারণ', r => { save('expense', { reason: r }, 'void', e.id); refresh(1); }) }, 'বাতিল'))))) : empty('এখনও কোনো খরচ নেই'))];
}
function expForm() {
  const c = chips(CATS.map(x => [x, x]), CATS[0]), m = chips(METH, 'cash'), am = inp({ inputmode: 'decimal', placeholder: '৳' }), dt = inp({ type: 'date', value: today() }), ds = inp({ placeholder: 'বিবরণ' });
  return ['নতুন খরচ', h('div', { class: 'card' }, fld('ধরন', c), fld('টাকার অঙ্ক', am), fld('মাধ্যম', m), fld('তারিখ', dt), fld('বিবরণ', ds), btn('খরচ সংরক্ষণ', () => { const a = P(am.value) / 100; if (!(a > 0)) return toast('টাকার অঙ্ক ঠিক নয়', 1); save('expense', { expense_date: dt.value, category: c.get(), amount: a, method: m.get(), description: ds.value }); toast('খরচ সংরক্ষিত'); go('expenses', true); }))];
}
function fbForm(q) {
  const k = chips(KIND, 'suggestion'), r = chips([1, 2, 3, 4, 5].map(n => [n, bn(n) + '★']), 0), ms = h('textarea', { placeholder: 'আপনার মতামত লিখুন (ব্যক্তিগত তথ্য লিখবেন না)', maxlength: 1000 });
  return ['মতামত', h('div', { class: 'card' }, fld('ধরন', k), fld('রেটিং (ঐচ্ছিক)', r), fld('মতামত', ms), h('div', { class: 'mu' }, 'স্ক্রিন: ' + (q.s || '—')), btn('পাঠান', () => { if (!ms.value.trim()) return toast('মতামত লিখুন', 1); save('feedback', { kind: k.get(), rating: r.get() || 0, screen: q.s || '', message: ms.value, app_version: VER, device_id: cfg.dev }); toast('ধন্যবাদ! মতামত সংরক্ষিত'); back(); }))];
}
function more() { const L = (t, to) => h('div', { class: 'row tap', onclick: pick(0, () => go(to)) }, h('span', {}, t), h('span', {}, '›')); return ['আরও', h('div', { class: 'card' }, L('⚙️ সেটিংস ও সংযোগ', 'settings'), L('💬 মতামত পাঠান', 'feedback?s=more'))]; }
function settings() {
  const a = inp({ placeholder: 'https://script.google.com/…/exec', value: cfg.api || '' }), t = inp({ type: 'password', placeholder: 'টোকেন' });
  return ['সেটিংস', h('div', {},
    h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', {}, 'সংযোগ'), h('b', {}, { ok: 'সংযুক্ত', checking: 'যাচাই হচ্ছে', offline: 'অফলাইন', auth: 'অনুমতি নেই', error: 'সংযোগ হয়নি', idle: 'যাচাই হয়নি' }[navigator.onLine ? S.conn : 'offline'])), S.err && h('div', { class: 'neg' }, S.err), h('div', { class: 'row' }, h('span', {}, 'সার্ভার'), h('span', { class: 'mu' }, cfg.api ? cfg.api.slice(0, 38) + '…' : 'পেয়ার করা হয়নি')), h('div', { class: 'row' }, h('span', {}, 'অ্যাপ সংস্করণ'), h('span', {}, bn(VER))), btn('এখনই সংযোগ যাচাই ও সিঙ্ক', () => sync(true))),
    h('div', { class: 'card' }, h('b', {}, 'হাতে পেয়ার করুন'), fld('Web app URL', a), fld('টোকেন', t), btn('সংরক্ষণ ও সংযোগ', () => { const api = a.value.trim(), token = t.value.trim(); if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(api) || token.length < 20) return toast('URL বা টোকেন ঠিক নয়', 1); cfg = { ...cfg, api, token }; LS('cfg', cfg); sync(true); })),
    bad.length ? h('div', { class: 'card' }, h('b', {}, 'যেসব এন্ট্রি গ্রহণ হয়নি (' + bn(bad.length) + ')'), bad.map(b => h('div', { class: 'row' }, h('span', {}, b.entity + ' — ' + b.err)))) : null, bad.length ? btn('তালিকা মুছুন', () => { bad = []; LS('bad', bad); refresh(1); }, 'ghost') : null,
    h('div', { class: 'card mu' }, '⚠ প্রোটোটাইপ: ফোনের ডেটা এনক্রিপ্টেড নয়। এই ট্রায়ালে আসল গ্রাহকের তথ্য লিখবেন না।'),
    btn('এই ফোন থেকে ডেটা মুছুন ও আনপেয়ার', () => { if (box.length && !confirm('সিঙ্ক বাকি ডেটা হারাবে। নিশ্চিত?')) return; localStorage.clear(); caches.keys().then(k => k.forEach(x => caches.delete(x))).finally(() => { location.hash = '#/'; location.reload(); }); }, 'ghost'))];
}

/* ---------- router ---------- */
const R = [[/^$/, home], [/^customers$/, customers], [/^customer\/new$/, custForm], [/^customer\/(.+)$/, custView], [/^order\/new$/, orderForm], [/^payment\/new$/, payForm], [/^expenses$/, expenses], [/^expense\/new$/, expForm], [/^feedback$/, fbForm], [/^more$/, more], [/^settings$/, settings]];
let cur = '';
function show(keep) {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?'), q = Object.fromEntries(new URLSearchParams(qs || '')); cur = path;
  for (const [re, fn] of R) { const m = path.match(re); if (!m) continue; const [title, el] = fn(q, m[1]);
    $('#top').replaceChildren(path ? h('button', { class: 'back', onclick: back, 'aria-label': 'পিছনে যান' }, '←') : null, h('h1', {}, title));
    $('#app').replaceChildren(el); document.title = 'শোহেল ব্যবসা'; if (!keep) scrollTo(0, 0);
    $('#nav').replaceChildren(...[['', '🏠', 'হোম'], ['customers', '👥', 'কাস্টমার'], ['expenses', '💸', 'খরচ'], ['more', '☰', 'আরও']].map(([p, i, l]) => h('a', { href: '#/' + p, class: path === p || (p === 'customers' && path.startsWith('customer')) ? 'on' : '' }, h('span', {}, i), l)));
    $('.fab').hidden = path === 'feedback'; return; }
  go('', true);
}
function refresh(force) { if (!force && (/new$|^feedback|^settings/.test(cur) || document.querySelector('dialog[open]'))) return; show(true); } // never wipes a half-filled form

/* ---------- boot ---------- */
(function boot() {
  if (top !== self) { document.body.textContent = ''; return; }
  if (location.hash.startsWith('#/pair')) {
    const q = new URLSearchParams(location.hash.split('?')[1] || ''), a = q.get('api'), t = q.get('token');
    history.replaceState(null, '', location.pathname + '#/'); // remove token from the address bar
    if (/^https:\/\/script\.google(usercontent)?\.com\//.test(a || '') && t) { cfg = { api: a, token: t }; toast('পেয়ারিং সম্পন্ন'); } else toast('পেয়ারিং লিংক ঠিক নয়', 1);
  }
  cfg.dev = cfg.dev || crypto.randomUUID(); LS('cfg', cfg);
  document.body.append(h('button', { class: 'fab', onclick: () => go('feedback?s=' + encodeURIComponent(cur || 'home')) }, '💬 মতামত'));
  addEventListener('hashchange', () => show()); addEventListener('online', () => sync()); addEventListener('offline', strip);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sync()); setInterval(() => sync(), 60000);
  navigator.storage && navigator.storage.persist && navigator.storage.persist();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(r => r.addEventListener('updatefound', () => { const w = r.installing; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { const u = $('#upd'); u.hidden = false; u.replaceChildren('নতুন সংস্করণ আছে — ', h('button', { class: 'btn s', onclick: () => { w.postMessage('skip'); setTimeout(() => location.reload(), 400); } }, 'আপডেট করুন')); } }); }));
  strip(); show(); sync();
})();
