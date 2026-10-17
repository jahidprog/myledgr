const VERSION = '0.1.0';
const T = { // entity -> [tab, business columns]
  customer: ['Customers', 'id,name,phone,address,notes'],
  order:    ['Orders', 'id,customer_id,customer_name,memo_no,order_date,notes,items,total'],
  payment:  ['Payments', 'id,customer_id,customer_name,amount,method,paid_on,notes'],
  expense:  ['Expenses', 'id,expense_date,category,amount,method,description'],
  feedback: ['Feedback', 'id,kind,rating,screen,message,app_version,device_id']
};
const SYS = ['status', 'void_reason', 'voided_at', 'created_at', 'updated_at', 'version', 'op_id'];
const NUMC = ['amount', 'total', 'rating', 'version'];
const MAXLEN = { name: 120, notes: 1000, message: 1000, description: 1000, address: 500 };
const METHODS = ['cash', 'bank', 'bkash', 'nagad', 'other'];
const KINDS = ['suggestion', 'bug', 'praise', 'question', 'task', 'answer'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cols_(en) { return T[en][1].split(',').concat(SYS); }

/* ---------- menu & setup ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Shohel App')
    .addItem('1. Setup (tabs + token)', 'setup')
    .addItem('2. Generate pairing link', 'pairing')
    .addItem('3. Rotate token', 'rotateToken').addToUi();
}
function setup() {
  const ss = SpreadsheetApp.getActive(); ss.setSpreadsheetTimeZone('Asia/Dhaka');
  Object.keys(T).concat(['_Ops']).forEach(function (en) {
    const name = T[en] ? T[en][0] : '_Ops';
    const cols = T[en] ? cols_(en) : ['op_id', 'entity', 'entity_id', 'result_json', 'applied_at'];
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@'); // plain text: ids, dates, phones
    cols.forEach(function (c, i) {
      if (NUMC.indexOf(c) >= 0) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat(c === 'amount' || c === 'total' ? '0.00' : '0');
    });
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold'); sh.setFrozenRows(1);
  });
  ss.getSheetByName('_Ops').hideSheet();
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('API_TOKEN')) p.setProperty('API_TOKEN', Utilities.getUuid() + Utilities.getUuid());
  SpreadsheetApp.getUi().alert('Setup done. Next: Deploy > New deployment > Web app (Execute as: Me, Access: Anyone), then menu 2.');
}
function pairing() {
  const ui = SpreadsheetApp.getUi(), r = ui.prompt('GitHub Pages URL (e.g. https://user.github.io/repo/)');
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const url = ScriptApp.getService().getUrl();
  if (!url) return ui.alert('Deploy as Web app first.');
  const base = r.getResponseText().trim().replace(/#.*$/, '');
  ui.alert('Open ONLY on the phone to pair:\n\n' + base + '#/pair?api=' + encodeURIComponent(url) +
    '&token=' + PropertiesService.getScriptProperties().getProperty('API_TOKEN'));
}
function rotateToken() {
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', Utilities.getUuid() + Utilities.getUuid());
  SpreadsheetApp.getUi().alert('Token rotated. Old pairings stop working. Generate a new link.');
}

/* ---------- web app ---------- */
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return json_({ ok: true, service: 'shohel-prototype', version: VERSION }); }
function tokenOk_(t) { // constant-time style compare
  const s = PropertiesService.getScriptProperties().getProperty('API_TOKEN') || ''; t = String(t || '');
  let d = s.length ^ t.length;
  for (let i = 0; i < s.length; i++) d |= s.charCodeAt(i) ^ (t.charCodeAt(i) || 0);
  return s.length > 0 && d === 0;
}
function doPost(e) {
  try {
    if (e.postData.contents.length > 200000) return json_({ ok: false, error: 'too_large' });
    const b = JSON.parse(e.postData.contents);
    if (!tokenOk_(b.token)) { Utilities.sleep(800); return json_({ ok: false, error: 'unauthorized' }); }
    if (b.action === 'ping') return json_({ ok: true, server_time: new Date().toISOString(), version: VERSION });
    if (b.action === 'snapshot') return json_(snapshot_());
    if (b.action === 'push') return json_(push_(b));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    console.error(String(err));
    return json_({ ok: false, error: 'server_error', message: 'Server error' });
  }
}

/* ---------- text safety (formula injection) ---------- */
function clean_(v, max) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim().slice(0, max || 200);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function unclean_(s) { return /^'[=+\-@]/.test(s) ? s.slice(1) : s; }

/* ---------- reads ---------- */
function rows_(en) {
  const sh = SpreadsheetApp.getActive().getSheetByName(T[en][0]), n = sh.getLastRow(), cols = cols_(en);
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, cols.length).getValues().map(function (r) {
    const o = {}; cols.forEach(function (c, i) { o[c] = typeof r[i] === 'string' ? unclean_(r[i]) : r[i]; }); return o;
  });
}
function snapshot_() {
  const tables = {};
  Object.keys(T).forEach(function (en) { if (en !== 'feedback') tables[en + 's'] = rows_(en); });
  return { ok: true, tables: tables, data_version: Number(PropertiesService.getScriptProperties().getProperty('DV') || 0), server_time: new Date().toISOString() };
}

/* ---------- writes ---------- */
function tomorrow_() { return Utilities.formatDate(new Date(Date.now() + 864e5), 'Asia/Dhaka', 'yyyy-MM-dd'); }
function check_(en, p, cust) {
  const num = function (x) { return typeof x === 'number' && isFinite(x); };
  if ((en === 'payment' || en === 'expense') && !(num(p.amount) && p.amount > 0 && p.amount < 1e10)) return 'amount_invalid';
  const dk = { order: 'order_date', payment: 'paid_on', expense: 'expense_date' }[en];
  if (dk && (!DATE_RE.test(p[dk] || '') || p[dk] > tomorrow_())) return 'date_invalid';
  if ((en === 'payment' || en === 'expense') && METHODS.indexOf(p.method) < 0) return 'method_invalid';
  if ((en === 'payment' || en === 'order') && !cust[p.customer_id]) return 'customer_not_found';
  if (en === 'customer' && !clean_(p.name)) return 'name_required';
  if (en === 'expense' && !clean_(p.category)) return 'category_required';
  if (en === 'feedback' && (KINDS.indexOf(p.kind) < 0 || !clean_(p.message, 1000))) return 'feedback_invalid';
  if (en === 'order') {
    if (!Array.isArray(p.items) || !p.items.length || p.items.length > 50) return 'items_invalid';
    for (let i = 0; i < p.items.length; i++) {
      const x = p.items[i];
      if (!clean_(x.product) || !Number.isInteger(x.quantity) || x.quantity < 1 || !num(x.rate) || x.rate < 0) return 'items_invalid';
    }
  }
  return null;
}
function build_(en, p, cust) {
  const o = {};
  T[en][1].split(',').forEach(function (c) {
    if (c === 'id' || c === 'items' || c === 'total') return;
    o[c] = NUMC.indexOf(c) >= 0 ? Number(p[c] || 0) : clean_(p[c], MAXLEN[c]);
  });
  if (p.customer_id) o.customer_name = cust[p.customer_id];
  if (en === 'order') {
    const it = p.items.map(function (i) { return { product: clean_(i.product, 120), quantity: i.quantity, rate: i.rate }; });
    o.items = JSON.stringify(it);
    o.total = it.reduce(function (s, i) { return s + i.quantity * Math.round(i.rate * 100); }, 0) / 100;
  }
  return o;
}
function idRows_(sh, cache) {
  const k = sh.getName(); if (cache[k]) return cache[k];
  const n = sh.getLastRow(), m = {};
  if (n > 1) sh.getRange(2, 1, n - 1, 1).getValues().forEach(function (r, i) { m[r[0]] = i + 2; });
  return (cache[k] = m);
}
function apply_(ss, op, seen, cust, cache) {
  const id = op && op.op_id, en = op && op.entity, rej = function (c) { return { op_id: id, status: 'rejected', code: c }; };
  if (!id || typeof id !== 'string' || id.length > 64 || !T[en] || ['create', 'void'].indexOf(op.op) < 0 ||
      !op.entity_id || String(op.entity_id).length > 64) return rej('op_invalid');
  if (seen[id]) return { op_id: id, status: 'duplicate' };
  const sh = ss.getSheetByName(T[en][0]), cols = cols_(en), now = new Date().toISOString(), idx = idRows_(sh, cache);
  if (op.op === 'void') { // soft delete only; never removes rows
    const row = idx[op.entity_id];
    if (!row || en === 'feedback') return rej('not_found');
    const reason = clean_(op.payload && op.payload.reason, 300);
    if (!reason) return rej('reason_required');
    const ver = cols.indexOf('version');
    const cur = sh.getRange(row, 1, 1, cols.length).getValues()[0];
    if (cur[cols.indexOf('status')] !== 'void') {
      sh.getRange(row, cols.indexOf('status') + 1, 1, 3).setValues([['void', reason, now]]);
      sh.getRange(row, cols.indexOf('updated_at') + 1, 1, 2).setValues([[now, Number(cur[ver]) + 1]]);
    }
    if (en === 'customer') delete cust[op.entity_id];
  } else {
    if (idx[op.entity_id]) return rej('id_conflict');
    const p = op.payload || {}, code = check_(en, p, cust);
    if (code) return rej(code);
    const rec = build_(en, p, cust); rec.id = op.entity_id;
    sh.appendRow(cols.map(function (c) {
      if (c === 'status') return 'active';
      if (c === 'created_at' || c === 'updated_at') return now;
      if (c === 'version') return 1;
      if (c === 'op_id') return id;
      return rec[c] === undefined ? '' : rec[c];
    }));
    idx[op.entity_id] = sh.getLastRow();
    if (en === 'customer') cust[rec.id] = rec.name;
  }
  ss.getSheetByName('_Ops').appendRow([id, en, op.entity_id, '{}', now]); seen[id] = 1;
  return { op_id: id, status: 'applied' };
}
function push_(b) {
  if (!Array.isArray(b.ops) || b.ops.length > 25) return { ok: false, error: 'batch_invalid', message: 'Batch invalid' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'busy', message: 'Server busy' };
  try {
    const ss = SpreadsheetApp.getActive(), ops = ss.getSheetByName('_Ops'), seen = {}, cache = {}, cust = {};
    const n = ops.getLastRow(); if (n > 1) ops.getRange(2, 1, n - 1, 1).getValues().forEach(function (r) { seen[r[0]] = 1; });
    rows_('customer').forEach(function (c) { if (c.status !== 'void') cust[c.id] = c.name; });
    const results = b.ops.map(function (op) {
      try { return apply_(ss, op, seen, cust, cache); }
      catch (e) { console.error(String(e)); return { op_id: op && op.op_id, status: 'rejected', code: 'server_error' }; }
    });
    const p = PropertiesService.getScriptProperties();
    p.setProperty('DV', String(Number(p.getProperty('DV') || 0) + 1));
    console.log('push n=' + results.length + ' applied=' + results.filter(function (r) { return r.status === 'applied'; }).length);
    return { ok: true, results: results, data_version: Number(p.getProperty('DV')) };
  } finally { lock.releaseLock(); }
}