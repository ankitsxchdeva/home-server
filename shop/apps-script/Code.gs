/**
 * Order backend for the friends-and-family sale page.
 *
 * Lives in a Google Sheet (Extensions > Apps Script) and is deployed as a web
 * app that runs as the sheet's owner. Tabs:
 *   Orders    one row per order, newest at the bottom
 *   Settings  price, inventory, sale times, payment handles, email templates
 *   Summary   live counts (formulas)
 *
 * Every order goes through a script lock, so two buyers can't take the last
 * case at the same moment.
 */

var ORDER_HEADERS = [
  "Order ID", "Placed at", "Status", "Name", "Email", "Phone", "Country",
  "Address line 1", "Address line 2", "Suburb / district", "City", "State / region", "Postal code",
  "Qty", "Unit price", "Subtotal", "Shipping", "Total due", "Currency",
  "Payment method", "Pay to", "Notes",
  "Payment email sent", "Paid on", "Carrier", "Tracking number", "Tracking email sent",
  "Request ID"
];

var STATUSES = ["New", "Payment requested", "Paid", "Shipped", "Cancelled"];
var CARRIERS = ["USPS", "UPS", "FedEx", "DHL", "Other"];

var DEFAULT_SETTINGS = [
  ["shop_name", "Friends & family sale", "Small line above the product name"],
  ["product_name", "Frosted Keycap Case", ""],
  ["description", "A frosted polycarbonate display case with a grid of individual slots for your artisan keycaps.", ""],
  ["seller_name", "Ankit", "Signs the emails"],
  ["order_prefix", "KC", "Order numbers look like KC-001"],
  ["inventory_total", 60, "Total cases for sale. Cancelled orders free their cases up again."],
  ["max_per_order", 4, ""],
  ["max_per_email", 4, "Cap across all orders from one email address"],
  ["unit_price", 145, ""],
  ["currency", "USD", ""],
  ["home_country", "US", "Two-letter code. Phone is required for addresses outside it."],
  ["allowed_countries", "", "Blank = ship anywhere. Or a list like US, CA, GB"],
  ["sale_opens_at", "", "Blank = open now. Or a date and time (sheet time zone)"],
  ["sale_closes_at", "", "Blank = no end"],
  ["sale_paused", false, "TRUE stops new orders without touching anything else"],
  ["pay_days", 3, "Days buyers have to pay after the payment email"],
  ["paypal_enabled", true, ""],
  ["paypal_handle", "[PayPal email or @handle]", "Shown to buyers who pick PayPal"],
  ["venmo_enabled", true, "US addresses only"],
  ["venmo_handle", "[@venmo-handle]", ""],
  ["wise_enabled", true, ""],
  ["wise_handle", "[Wise email or @wisetag]", ""],
  ["payment_email_subject", "Payment for your {{product}} order {{order_id}}", ""],
  ["payment_email_body",
    "Hi {{first_name}},\n\nThanks for ordering! Here's your total for order {{order_id}}:\n\n" +
    "{{qty}} × {{product}} at {{unit_price}}: {{subtotal}}\nShipping to {{country}}: {{shipping}}\nTotal: {{total}}\n\n" +
    "Please send {{total}} by {{payment_method}} to {{pay_to}} as Friends and Family, with {{order_id}} in the note, by {{pay_by}}.\n\n" +
    "Shipping to:\n{{address}}\n\nIf anything above is wrong, just reply to this email.\n\n{{seller_name}}", ""],
  ["tracking_email_subject", "Your {{product}} is on the way ({{order_id}})", ""],
  ["tracking_email_body",
    "Hi {{first_name}},\n\nYour order {{order_id}} shipped today with {{carrier}}.\n\n" +
    "Tracking number: {{tracking_number}}\n{{tracking_url}}\n\nThanks again!\n\n{{seller_name}}", ""]
];

// ---------------------------------------------------------------- Web app

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "status";
  if (action === "status") return json_(publicStatus_());
  return json_({ ok: false, error: "unknown_action" });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: "bad_request" }); }
  if (body.action !== "order") return json_({ ok: false, error: "unknown_action" });
  return json_(placeOrder_(body));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- Settings

function settings_() {
  var sh = SpreadsheetApp.getActive().getSheetByName("Settings");
  var s = {};
  DEFAULT_SETTINGS.forEach(function (r) { s[r[0]] = r[1]; });
  if (sh) {
    sh.getDataRange().getValues().slice(1).forEach(function (r) {
      if (r[0] !== "" && r[0] != null) s[String(r[0]).trim()] = r[1];
    });
  }
  ["inventory_total", "max_per_order", "max_per_email", "unit_price", "pay_days"].forEach(function (k) { s[k] = Number(s[k]); });
  ["sale_paused", "paypal_enabled", "venmo_enabled", "wise_enabled"].forEach(function (k) { s[k] = bool_(s[k]); });
  s.home_country = String(s.home_country || "US").trim().toUpperCase();
  return s;
}

function bool_(v) { return v === true || /^(true|yes|1)$/i.test(String(v).trim()); }

function date_(v) {
  if (v instanceof Date) return v;
  if (v === "" || v == null) return null;
  var d = new Date(v);
  return isNaN(d) ? null : d;
}

function paymentMethods_(s) {
  var all = [
    { id: "paypal", label: "PayPal", handle: s.paypal_handle, usOnly: false, on: s.paypal_enabled },
    { id: "venmo", label: "Venmo", handle: s.venmo_handle, usOnly: true, on: s.venmo_enabled },
    { id: "wise", label: "Wise", handle: s.wise_handle, usOnly: false, on: s.wise_enabled }
  ];
  return all.filter(function (m) { return m.on; }).map(function (m) {
    return { id: m.id, label: m.label, handle: String(m.handle || ""), usOnly: m.usOnly };
  });
}

function saleState_(s, now) {
  now = now || new Date();
  var opens = date_(s.sale_opens_at), closes = date_(s.sale_closes_at);
  if (s.sale_paused) return { open: false, paused: true };
  if (opens && now < opens) return { open: false, opensAt: opens.toISOString() };
  if (closes && now >= closes) return { open: false, closed: true };
  return { open: true };
}

// ---------------------------------------------------------------- Orders sheet

function ordersSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName("Orders");
  if (!sh) { setup(); sh = ss.getSheetByName("Orders"); }
  return sh;
}

function columns_(sh) {
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var map = {};
  head.forEach(function (h, i) { map[String(h).trim()] = i; });
  ORDER_HEADERS.forEach(function (h) { if (map[h] == null) throw new Error("Orders tab is missing the column \"" + h + "\". Run Shop > Set up sheet."); });
  return map;
}

function readOrders_(sh, col) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues().map(function (r, i) {
    return { row: i + 2, values: r, get: function (h) { return r[col[h]]; } };
  });
}

function soldCount_(orders) {
  return orders.reduce(function (n, o) {
    return o.get("Status") === "Cancelled" ? n : n + (Number(o.get("Qty")) || 0);
  }, 0);
}

function publicStatus_() {
  var s = settings_();
  var sh = ordersSheet_();
  var sold = soldCount_(readOrders_(sh, columns_(sh)));
  var st = saleState_(s);
  return {
    ok: true,
    shopName: s.shop_name, productName: s.product_name, description: s.description,
    unitPrice: s.unit_price, currency: s.currency,
    total: s.inventory_total, remaining: Math.max(0, s.inventory_total - sold),
    maxPerOrder: Math.min(s.max_per_order, s.max_per_email),
    homeCountry: s.home_country, payDays: s.pay_days,
    open: st.open, paused: !!st.paused, opensAt: st.opensAt || null, closed: !!st.closed,
    allowedCountries: allowedCountries_(s),
    // Handles are only sent back with a placed order.
    paymentMethods: paymentMethods_(s).map(function (m) { return { id: m.id, label: m.label, usOnly: m.usOnly }; })
  };
}

function allowedCountries_(s) {
  var raw = String(s.allowed_countries || "").trim();
  if (!raw) return null;
  return raw.split(/[\s,;]+/).map(function (c) { return c.toUpperCase(); }).filter(Boolean);
}

// Text that starts with = + - @ would run as a formula in the sheet.
function safe_(v) {
  v = v == null ? "" : String(v);
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

function placeOrder_(p) {
  var s = settings_();
  if (p.website) return { ok: false, error: "invalid", fields: {} }; // honeypot filled: a bot

  var check = validateOrder_(p, s);
  if (!check.ok) return { ok: false, error: "invalid", fields: check.fields };
  var o = check.order;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: "busy" };
  try {
    var sh = ordersSheet_();
    var col = columns_(sh);
    var orders = readOrders_(sh, col);

    // Same submit sent twice (double tap, retry after a timeout): return the first.
    var dup = orders.filter(function (r) { return r.get("Request ID") === o.requestId; })[0];
    if (dup) return { ok: true, order: summaryFromRow_(dup, s), duplicate: true, remaining: Math.max(0, s.inventory_total - soldCount_(orders)) };

    var st = saleState_(s);
    if (st.paused) return { ok: false, error: "paused" };
    if (st.opensAt) return { ok: false, error: "not_open", opensAt: st.opensAt };
    if (st.closed) return { ok: false, error: "closed" };

    var remaining = s.inventory_total - soldCount_(orders);
    if (remaining <= 0) return { ok: false, error: "sold_out", remaining: 0 };
    if (o.qty > remaining) return { ok: false, error: "not_enough", remaining: remaining };

    var mine = orders.reduce(function (n, r) {
      return r.get("Status") !== "Cancelled" && String(r.get("Email")).toLowerCase() === o.email ? n + (Number(r.get("Qty")) || 0) : n;
    }, 0);
    if (mine + o.qty > s.max_per_email) return { ok: false, error: "email_limit", alreadyOrdered: mine, max: s.max_per_email };

    // Next number after the highest existing one, so deleted rows never
    // cause a repeated order number.
    var next = orders.reduce(function (m, r) {
      var n = parseInt(String(r.get("Order ID")).replace(/^\D+/, ""), 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0) + 1;
    var id = String(s.order_prefix || "KC") + "-" + ("00" + next).slice(-Math.max(3, String(next).length));
    var rowNum = sh.getLastRow() + 1;
    var method = paymentMethods_(s).filter(function (m) { return m.id === o.paymentMethod; })[0];
    var row = new Array(sh.getLastColumn()).fill("");
    var put = function (h, v) { row[col[h]] = v; };
    put("Order ID", id);
    put("Placed at", new Date());
    put("Status", "New");
    put("Name", safe_(o.name));
    put("Email", safe_(o.email));
    put("Phone", safe_(o.phone));
    put("Country", o.address.country);
    put("Address line 1", safe_(o.address.address1));
    put("Address line 2", safe_(o.address.address2));
    put("Suburb / district", safe_(o.address.sublocality));
    put("City", safe_(o.address.city));
    put("State / region", safe_(o.address.regionName || o.address.region));
    put("Postal code", safe_(o.address.postal));
    put("Qty", o.qty);
    put("Unit price", s.unit_price);
    put("Subtotal", o.qty * s.unit_price);
    put("Currency", s.currency);
    put("Payment method", method.label);
    put("Pay to", safe_(method.handle));
    put("Notes", safe_(o.notes));
    put("Request ID", o.requestId);
    sh.getRange(rowNum, 1, 1, row.length).setValues([row]);
    // Postal codes and phones stay text (leading zeros, "+44").
    sh.getRange(rowNum, col["Postal code"] + 1).setNumberFormat("@").setValue(safe_(o.address.postal));
    SpreadsheetApp.flush();

    var summary = {
      id: id, placedAt: new Date().toISOString(), qty: o.qty, productName: s.product_name,
      unitPrice: s.unit_price, subtotal: o.qty * s.unit_price, currency: s.currency,
      name: o.name, email: o.email, phone: o.phone, address: o.address,
      paymentMethod: method.label, paymentHandle: method.handle, payDays: s.pay_days
    };
    return { ok: true, order: summary, remaining: remaining - o.qty };
  } finally {
    lock.releaseLock();
  }
}

function summaryFromRow_(r, s) {
  return {
    id: r.get("Order ID"), qty: Number(r.get("Qty")), productName: s.product_name,
    unitPrice: Number(r.get("Unit price")), subtotal: Number(r.get("Subtotal")), currency: r.get("Currency"),
    name: r.get("Name"), email: r.get("Email"), phone: r.get("Phone"),
    address: {
      country: r.get("Country"), address1: r.get("Address line 1"), address2: r.get("Address line 2"),
      sublocality: r.get("Suburb / district"), city: r.get("City"), regionName: r.get("State / region"),
      postal: r.get("Postal code")
    },
    paymentMethod: r.get("Payment method"), paymentHandle: r.get("Pay to"), payDays: s.pay_days
  };
}

// ---------------------------------------------------------------- Validation (server copy)

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;

function validateOrder_(p, s) {
  var f = {};
  var str = function (v, max) { return String(v == null ? "" : v).trim().replace(/\s+/g, " ").slice(0, max || 120); };
  var o = {
    requestId: str(p.requestId, 80),
    name: str(p.name, 100),
    email: str(p.email, 120).toLowerCase(),
    phone: str(p.phone, 30),
    qty: Number(p.qty),
    paymentMethod: str(p.paymentMethod, 20),
    notes: String(p.notes == null ? "" : p.notes).trim().slice(0, 500),
    address: {}
  };
  if (!o.requestId) f.form = "Missing request ID.";
  if (o.name.length < 2) f.name = "Enter your full name.";
  if (!EMAIL_RE.test(o.email)) f.email = "Enter a valid email address.";
  var maxQ = Math.min(s.max_per_order, s.max_per_email);
  if (!(o.qty >= 1 && o.qty <= maxQ && Math.floor(o.qty) === o.qty)) f.qty = "Choose between 1 and " + maxQ + ".";
  if (p.ack !== true) f.ack = "Tick the friends and family box.";

  var a = p.address || {};
  var cc = str(a.country, 2).toUpperCase();
  var data = ADDRESS_DATA[cc];
  var allowed = allowedCountries_(s);
  if (!data) f.country = "Choose a country.";
  else if (allowed && allowed.indexOf(cc) === -1) f.country = "Sorry, this sale doesn't ship there.";
  var addr = {
    country: cc,
    address1: str(a.address1), address2: str(a.address2), sublocality: str(a.sublocality),
    city: str(a.city), region: str(a.region), regionName: str(a.regionName),
    postal: str(a.postal, 20).toUpperCase()
  };
  if (data) {
    var req = data.r || "AC";
    var need = { A: "address1", C: "city", S: "region", Z: "postal", D: "sublocality" };
    Object.keys(need).forEach(function (k) {
      if (req.indexOf(k) !== -1 && !addr[need[k]]) f[need[k]] = "This field is required.";
    });
    var regionKey = null;
    if (data.s && addr.region) {
      if (data.s.hasOwnProperty(addr.region)) regionKey = addr.region;
      else if (data.sn && data.sn[addr.region]) regionKey = data.sn[addr.region];
      else f.region = "Choose your state or region from the list.";
    }
    if (addr.postal && data.z) {
      if (!new RegExp("^(?:" + data.z + ")$", "i").test(addr.postal)) f.postal = "That postal code doesn't match this country.";
      else if (regionKey && data.s[regionKey] && !new RegExp("^(?:" + data.s[regionKey] + ")", "i").test(addr.postal)) {
        f.postal = "That postal code isn't in the chosen state or region.";
      }
    }
  }
  var digits = o.phone.replace(/\D/g, "");
  if (cc && cc !== s.home_country && digits.length < 7) f.phone = "A phone number is needed for international shipping.";
  else if (o.phone && (digits.length < 7 || digits.length > 15)) f.phone = "Enter a phone number with 7 to 15 digits.";

  var method = paymentMethods_(s).filter(function (m) { return m.id === o.paymentMethod; })[0];
  if (!method) f.paymentMethod = "Choose how you'll pay.";
  else if (method.usOnly && cc !== "US") f.paymentMethod = method.label + " only works for US addresses. Choose another option.";

  o.address = addr;
  return Object.keys(f).length ? { ok: false, fields: f } : { ok: true, order: o };
}
