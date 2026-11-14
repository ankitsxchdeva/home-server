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
  for (const k of ["qty", "email", "ack", "postal", "phone", "paymentMethod"]) assert.ok(r.fields[k], k);
  assert.strictEqual(env.ss.getSheetByName("Orders").getLastRow(), 1);
});

test("international order with phone and Wise works; ZIP-state mismatch is caught", () => {
  const env = fresh();
  assert.ok(post(env, order({ paymentMethod: "wise", phone: "+44 20 7946 0958",
    address: { country: "GB", address1: "221B Baker St", city: "London", postal: "NW1 6XE" } })).ok);
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

test("payment emails: skip rows without shipping, draft the rest, never double-draft", () => {
  const env = fresh();
  setSetting(env, "paypal_handle", "ankit@example.com");
  post(env, order({ qty: 2, email: "a@example.com" })); post(env, order({ email: "b@example.com" }));
  const sh = env.ss.getSheetByName("Orders"); const col = env.ctx.columns_(sh);
  sh.cells[1][col["Shipping"]] = 12;
  env.ctx.onEdit({ range: sh.getRange(2, col["Shipping"] + 1) });
  assert.strictEqual(sh.cells[1][col["Total due"]], 302);
  env.ss.setActiveSheet(sh); sh._active = sh.getRange(2, 1, 2, 1);
  env.ctx.draftPaymentEmails();
  assert.strictEqual(env.drafts.length, 1); assert.strictEqual(env.sent.length, 0);
  assert.strictEqual(env.drafts[0].to, "a@example.com");
  assert.match(env.drafts[0].body, /Total: \$302/); assert.match(env.drafts[0].body, /PayPal to ankit@example.com as Friends and Family/);
  assert.match(env.alerts.at(-1)[0], /KC-002: no shipping amount yet/);
  assert.strictEqual(sh.cells[1][col["Status"]], "Payment requested");
  env.ctx.draftPaymentEmails();
  assert.strictEqual(env.drafts.length, 1);
});

test("placeholder payment handle blocks payment emails", () => {
  const env = fresh();
  post(env, order());
  const sh = env.ss.getSheetByName("Orders"); const col = env.ctx.columns_(sh);
  sh.cells[1][col["Shipping"]] = 10; env.ss.setActiveSheet(sh); sh._active = sh.getRange(2, 1);
  env.ctx.sendPaymentEmails();
  assert.strictEqual(env.sent.length, 0); assert.match(env.alerts.at(-1)[0], /placeholder/);
});

test("tracking emails send after confirmation and mark shipped; test goes only to owner", () => {
  const env = fresh();
  post(env, order({ email: "c@example.com" }));
  const sh = env.ss.getSheetByName("Orders"); const col = env.ctx.columns_(sh);
  sh.cells[1][col["Carrier"]] = "USPS"; sh.cells[1][col["Tracking number"]] = "9400111899223197428490";
  env.ss.setActiveSheet(sh); sh._active = sh.getRange(2, 1);
  env.ctx.sendTestToMe();
  assert.ok(env.sent.every((m) => m.to === "owner@example.com"));
  env.ctx.sendTrackingEmails();
  const last = env.sent.at(-1);
  assert.strictEqual(last.to, "c@example.com"); assert.match(last.body, /tLabels=9400111899223197428490/);
  assert.strictEqual(sh.cells[1][col["Status"]], "Shipped");
});

test("declining the send confirmation sends nothing", () => {
  const env = load({ answer: "NO" }); env.ctx.setup();
  post(env, order());
  const sh = env.ss.getSheetByName("Orders"); const col = env.ctx.columns_(sh);
  sh.cells[1][col["Carrier"]] = "UPS"; sh.cells[1][col["Tracking number"]] = "1Z999";
  env.ss.setActiveSheet(sh); sh._active = sh.getRange(2, 1);
  env.ctx.sendTrackingEmails();
  assert.strictEqual(env.sent.length, 0);
});
