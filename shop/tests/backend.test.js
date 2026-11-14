const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./gas-mock");

function setSetting(env, key, value) {
  const st = env.ss.getSheetByName("Settings");
  const row = st.cells.findIndex((r) => r && r[0] === key);
  st.cells[row][1] = value;
}
const post = (env, body) => JSON.parse(env.ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
const status = (env) => JSON.parse(env.ctx.doGet({ parameter: { action: "status" } }).text);
let n = 0;
const order = (over = {}) => Object.assign({
  action: "order", requestId: "req-" + (++n), qty: 1, name: "Sam Rivera", email: `buyer${n}@example.com`, phone: "",
  address: { country: "US", address1: "1100 S Lamar Blvd", city: "Austin", region: "TX", postal: "78704" },
  paymentMethod: "paypal", ack: true, notes: "", website: "",
}, over);

function fresh() { const env = load(); env.ctx.setup(); return env; }

test("setup builds the tabs and status reports 60 left at $145", () => {
  const env = fresh();
  assert.ok(env.ss.getSheetByName("Orders") && env.ss.getSheetByName("Settings") && env.ss.getSheetByName("Summary"));
  const s = status(env);
  assert.strictEqual(s.remaining, 60); assert.strictEqual(s.unitPrice, 145); assert.strictEqual(s.maxPerOrder, 4);
  assert.strictEqual(s.pageTitle, "2026 Inkwell 10x10 in-stock sale");
  assert.ok(s.paymentMethods.every((m) => !("handle" in m)), "handles not public");
  assert.deepStrictEqual(s.paymentMethods.map((m) => m.id), ["paypal", "venmo", "wise"]);
});

test("an order lands in the sheet with subtotal and payment method", () => {
  const env = fresh();
  const r = post(env, order({ qty: 3, paymentMethod: "venmo" }));
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.order.id, "KC-001"); assert.strictEqual(r.order.subtotal, 435); assert.strictEqual(r.remaining, 57);
  const sh = env.ss.getSheetByName("Orders"); const col = env.ctx.columns_(sh);
  const row = sh.cells[1];
  assert.strictEqual(row[col["Status"]], "New"); assert.strictEqual(row[col["Payment method"]], "Venmo");
  assert.strictEqual(row[col["Subtotal"]], 435); assert.strictEqual(row[col["Postal code"]], "78704");
  assert.strictEqual(status(env).remaining, 57);
});

test("inventory can't be oversold: 60 boxes, then sold out", () => {
  const env = fresh();
  for (let i = 0; i < 15; i++) assert.ok(post(env, order({ qty: 4 })).ok);
  assert.strictEqual(status(env).remaining, 0);
  const r = post(env, order({ qty: 1 }));
  assert.strictEqual(r.error, "sold_out");
  assert.strictEqual(env.ss.getSheetByName("Orders").getLastRow(), 16);
});

test("asking for more than what's left says how many remain", () => {
  const env = fresh();
  setSetting(env, "inventory_total", 6);
  assert.ok(post(env, order({ qty: 4 })).ok);
  const r = post(env, order({ qty: 3 }));
  assert.strictEqual(r.error, "not_enough"); assert.strictEqual(r.remaining, 2);
});

test("a cancelled order frees its boxes", () => {
  const env = fresh();
  setSetting(env, "inventory_total", 4);
  post(env, order({ qty: 4 }));
  assert.strictEqual(post(env, order()).error, "sold_out");
  const sh = env.ss.getSheetByName("Orders"); sh.cells[1][env.ctx.columns_(sh)["Status"]] = "Cancelled";
  assert.ok(post(env, order({ qty: 2 })).ok);
});

test("same request sent twice makes one order", () => {
  const env = fresh();
  const o = order({ qty: 2 });
  const a = post(env, o), b = post(env, o);
  assert.ok(a.ok && b.ok && b.duplicate); assert.strictEqual(a.order.id, b.order.id);
  assert.strictEqual(status(env).remaining, 58);
});

test("one email can't go past 4 across orders", () => {
  const env = fresh();
  assert.ok(post(env, order({ qty: 3, email: "pat@example.com" })).ok);
  const r = post(env, order({ qty: 2, email: "PAT@example.com" }));
  assert.strictEqual(r.error, "email_limit"); assert.strictEqual(r.alreadyOrdered, 3);
});

test("server rejects bad input even if the page is bypassed", () => {
  const env = fresh();
  const r = post(env, order({ qty: 9, email: "nope", ack: false, paymentMethod: "venmo",
    address: { country: "GB", address1: "1 High St", city: "London", postal: "12345" } }));
  assert.strictEqual(r.error, "invalid");
  for (const k of ["qty", "email", "ack", "postal", "paymentMethod"]) assert.ok(r.fields[k], k);
  assert.ok(!r.fields.phone, "no phone asked for international");
  assert.ok(post(env, order({ phone: "12" })).fields.phone, "short US phone rejected");
  assert.strictEqual(env.ss.getSheetByName("Orders").getLastRow(), 1);
});

test("international order with Wise works without a phone; ZIP-state mismatch is caught", () => {
  const env = fresh();
  assert.ok(post(env, order({ paymentMethod: "wise", phone: "+44 20 7946 0958",
    address: { country: "GB", address1: "221B Baker St", city: "London", postal: "NW1 6XE" } })).ok);
  const sh = env.ss.getSheetByName("Orders"); const col = env.ctx.columns_(sh);
  assert.strictEqual(sh.cells[1][col["Phone"]], "", "phone not stored for international orders");
  assert.ok(post(env, order({ paymentMethod: "paypal", phone: "",
    address: { country: "DE", address1: "Unter den Linden 1", city: "Berlin", postal: "10117" } })).ok);
  const r = post(env, order({ address: { country: "US", address1: "1 Main", city: "Austin", region: "TX", postal: "10001" } }));
  assert.ok(r.fields.postal);
});

test("formula-looking text is stored as plain text", () => {
  const env = fresh();
  post(env, order({ name: "=HYPERLINK(\"x\")", phone: "+1 512 555 0100" }));
  const sh = env.ss.getSheetByName("Orders"); const col = env.ctx.columns_(sh);
  assert.strictEqual(sh.cells[1][col["Name"]][0], "'");
  assert.strictEqual(sh.cells[1][col["Phone"]], "'+1 512 555 0100");
});

test("sale not open yet, paused, and honeypot", () => {
  const env = fresh();
  setSetting(env, "sale_opens_at", new Date(Date.now() + 3600e3));
  assert.strictEqual(post(env, order()).error, "not_open");
  assert.strictEqual(status(env).open, false);
  setSetting(env, "sale_opens_at", "");
  setSetting(env, "sale_paused", true);
  assert.strictEqual(post(env, order()).error, "paused");
  setSetting(env, "sale_paused", false);
  assert.strictEqual(post(env, order({ website: "spam" })).error, "invalid");
});

test("lock contention answers busy instead of writing", () => {
  const env = load({ lockFails: true }); env.ctx.setup();
  assert.strictEqual(post(env, order()).error, "busy");
});

test("order numbers never repeat after a row is deleted", () => {
  const env = fresh();
  post(env, order()); post(env, order());
  const sh = env.ss.getSheetByName("Orders"); sh.cells.splice(1, 1); // delete KC-001
  assert.strictEqual(post(env, order()).order.id, "KC-003");
});

test("script has no email access and is limited to this sheet", () => {
  const fs = require("fs"), path = require("path");
  const dir = path.join(__dirname, "..", "apps-script");
  const src = ["Code.gs", "Admin.gs"].map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  assert.doesNotMatch(src, /GmailApp|MailApp|Session\.|openById|openByUrl|DriveApp|UrlFetchApp/);
  assert.match(fs.readFileSync(path.join(dir, "Admin.gs"), "utf8"), /^\/\*\* @OnlyCurrentDoc \*\//);
});

test("Shop menu offers only Mark paid and Set up", () => {
  const env = fresh(); const items = [];
  const menu = { addItem: (l, f) => { items.push(f); return menu; }, addSeparator: () => menu, addToUi: () => {} };
  const ui = env.ctx.SpreadsheetApp.getUi(); const orig = ui.createMenu; ui.createMenu = () => menu;
  env.ctx.onOpen(); ui.createMenu = orig;
  assert.deepStrictEqual(items, ["markPaid", "setup"]);
  items.forEach((f) => assert.strictEqual(typeof env.ctx[f], "function"));
});

test("shipping fills Total due, and Mark paid skips cancelled rows", () => {
  const env = fresh();
  post(env, order({ qty: 2, email: "a@example.com" })); post(env, order({ email: "b@example.com" }));
  const sh = env.ss.getSheetByName("Orders"); const col = env.ctx.columns_(sh);
  sh.cells[1][col["Shipping"]] = 12;
  env.ctx.onEdit({ range: sh.getRange(2, col["Shipping"] + 1) });
  assert.strictEqual(sh.cells[1][col["Total due"]], 302);
  sh.cells[2][col["Status"]] = "Cancelled";
  env.ss.setActiveSheet(sh); sh._active = sh.getRange(2, 1, 2, 1);
  env.ctx.markPaid();
  assert.strictEqual(sh.cells[1][col["Status"]], "Paid"); assert.ok(sh.cells[1][col["Paid on"]]);
  assert.strictEqual(sh.cells[2][col["Status"]], "Cancelled"); assert.ok(!sh.cells[2][col["Paid on"]]);
});

test("address rules also load from a hidden AddressData tab instead of AddressData.gs", () => {
  const env = load({ addressTab: true }); env.ctx.setup();
  assert.strictEqual(env.ss.getSheetByName("AddressData").sheetHidden, true, "setup hides the tab");
  assert.ok(post(env, order({ paymentMethod: "wise",
    address: { country: "GB", address1: "221B Baker St", city: "London", postal: "NW1 6XE" } })).ok);
  const r = post(env, order({ address: { country: "US", address1: "1 Main", city: "Austin", region: "TX", postal: "10001" } }));
  assert.ok(r.fields.postal, "ZIP outside the state is still refused");
});
