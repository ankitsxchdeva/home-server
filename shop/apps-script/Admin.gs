/**
 * Sheet setup and the Shop menu: email payment details and tracking numbers
 * to buyers from your own Gmail.
 *
 * Every email action works on the rows you've selected in the Orders tab.
 * "Draft" puts the emails in your Gmail Drafts to review and send yourself, and
 * notes "Drafted" on the row so the same email isn't made twice.
 * "Send" asks you to confirm the list of recipients first.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Shop")
    .addItem("Draft payment emails for selected rows", "draftPaymentEmails")
    .addItem("Send payment emails for selected rows", "sendPaymentEmails")
    .addSeparator()
    .addItem("Mark selected rows as paid", "markPaid")
    .addSeparator()
    .addItem("Draft tracking emails for selected rows", "draftTrackingEmails")
    .addItem("Send tracking emails for selected rows", "sendTrackingEmails")
    .addSeparator()
    .addItem("Email me a test using the selected row", "sendTestToMe")
    .addItem("Set up sheet", "setup")
    .addToUi();
}

// ---------------------------------------------------------------- Setup

function setup() {
  var ss = SpreadsheetApp.getActive();

  var orders = ss.getSheetByName("Orders") || ss.insertSheet("Orders", 0);
  if (orders.getLastRow() === 0) {
    orders.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]);
  } else {
    // Add any missing columns at the end, never reorder what's there.
    var head = orders.getRange(1, 1, 1, Math.max(1, orders.getLastColumn())).getValues()[0].map(String);
    ORDER_HEADERS.forEach(function (h) {
      if (head.indexOf(h) === -1) { orders.getRange(1, orders.getLastColumn() + 1).setValue(h); head.push(h); }
    });
  }
  orders.setFrozenRows(1);
  orders.getRange(1, 1, 1, orders.getLastColumn()).setFontWeight("bold").setBackground("#e6e6e6");
  var col = columns_(orders);
  var rows = orders.getMaxRows() - 1;
  var rule = function (list) { return SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build(); };
  orders.getRange(2, col["Status"] + 1, rows).setDataValidation(rule(STATUSES));
  orders.getRange(2, col["Carrier"] + 1, rows).setDataValidation(rule(CARRIERS));
  orders.getRange(2, col["Placed at"] + 1, rows).setNumberFormat("yyyy-mm-dd hh:mm");
  ["Payment email sent", "Paid on", "Tracking email sent"].forEach(function (h) {
    orders.getRange(2, col[h] + 1, rows).setNumberFormat("yyyy-mm-dd hh:mm");
  });
  ["Unit price", "Subtotal", "Shipping", "Total due"].forEach(function (h) {
    orders.getRange(2, col[h] + 1, rows).setNumberFormat("$#,##0.00");
  });
  ["Postal code", "Phone", "Tracking number"].forEach(function (h) {
    orders.getRange(2, col[h] + 1, rows).setNumberFormat("@");
  });
  orders.getRange(1, col["Total due"] + 1).setNote("Fills itself when you type a Shipping amount.");
  orders.getRange(1, col["Request ID"] + 1).setNote("Used to stop double orders. Leave it alone.");
  orders.hideColumns(col["Request ID"] + 1);

  var st = ss.getSheetByName("Settings") || ss.insertSheet("Settings");
  if (st.getLastRow() === 0) st.getRange(1, 1, 1, 3).setValues([["Setting", "Value", "Notes"]]).setFontWeight("bold");
  var have = st.getLastRow() > 1 ? st.getRange(2, 1, st.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  DEFAULT_SETTINGS.forEach(function (r) {
    if (have.indexOf(r[0]) === -1) st.appendRow([r[0], r[1], r[2]]);
  });
  st.setFrozenRows(1);
  st.setColumnWidth(1, 200); st.setColumnWidth(2, 380); st.setColumnWidth(3, 360);
  st.getRange("B:B").setWrap(true);

  var sm = ss.getSheetByName("Summary") || ss.insertSheet("Summary");
  sm.clear();
  var q = colLetter_(col["Qty"]), s = colLetter_(col["Status"]), t = colLetter_(col["Total due"]), su = colLetter_(col["Subtotal"]);
  var inv = "VLOOKUP(\"inventory_total\",Settings!A:B,2,FALSE)";
  sm.getRange(1, 1, 9, 2).setValues([
    ["What", "Count"],
    ["Cases for sale", "=" + inv],
    ["Cases ordered (not cancelled)", "=SUMIFS(Orders!" + q + ":" + q + ",Orders!" + s + ":" + s + ",\"<>Cancelled\")"],
    ["Cases left", "=MAX(0,B2-B3)"],
    ["Orders waiting for a payment email", "=COUNTIF(Orders!" + s + ":" + s + ",\"New\")"],
    ["Orders waiting for payment", "=COUNTIF(Orders!" + s + ":" + s + ",\"Payment requested\")"],
    ["Orders paid, not shipped", "=COUNTIF(Orders!" + s + ":" + s + ",\"Paid\")"],
    ["Orders shipped", "=COUNTIF(Orders!" + s + ":" + s + ",\"Shipped\")"],
    ["Money received (subtotal + shipping)", "=SUMIFS(Orders!" + t + ":" + t + ",Orders!" + s + ":" + s + ",\"Paid\")+SUMIFS(Orders!" + t + ":" + t + ",Orders!" + s + ":" + s + ",\"Shipped\")"]
  ]);
  sm.getRange(1, 1, 1, 2).setFontWeight("bold");
  sm.getRange("B9").setNumberFormat("$#,##0.00");
  sm.setColumnWidth(1, 300);

  ss.setActiveSheet(orders);
}

// Simple trigger: typing a Shipping amount fills Total due for that row.
function onEdit(e) {
  var sh = e.range.getSheet();
  if (sh.getName() !== "Orders" || e.range.getRow() < 2) return;
  var col = columns_(sh);
  var shipCol = col["Shipping"] + 1;
  if (shipCol < e.range.getColumn() || shipCol > e.range.getLastColumn()) return;
  for (var r = e.range.getRow(); r <= e.range.getLastRow(); r++) {
    var sub = sh.getRange(r, col["Subtotal"] + 1).getValue();
    var ship = sh.getRange(r, shipCol).getValue();
    sh.getRange(r, col["Total due"] + 1).setValue(ship === "" || sub === "" ? "" : Number(sub) + Number(ship));
  }
}

function colLetter_(index0) {
  var n = index0 + 1, s = "";
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// ---------------------------------------------------------------- Selection helpers

function selectedOrders_() {
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== "Orders") throw new Error("Switch to the Orders tab and select the rows first.");
  var col = columns_(sh);
  var rows = {};
  var list = sh.getActiveRangeList();
  (list ? list.getRanges() : [sh.getActiveRange()]).forEach(function (r) {
    for (var i = r.getRow(); i < r.getRow() + r.getNumRows(); i++) if (i >= 2) rows[i] = true;
  });
  var nums = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
  return nums.map(function (n) {
    var vals = sh.getRange(n, 1, 1, sh.getLastColumn()).getValues()[0];
    return { row: n, values: vals, get: function (h) { return vals[col[h]]; } };
  }).filter(function (o) { return o.get("Order ID"); });
}

function setCell_(o, header, value) {
  var sh = SpreadsheetApp.getActive().getSheetByName("Orders");
  sh.getRange(o.row, columns_(sh)[header] + 1).setValue(value);
}

// ---------------------------------------------------------------- Email building

var TRACKING_URLS = {
  USPS: "https://tools.usps.com/go/TrackConfirmAction?tLabels=",
  UPS: "https://www.ups.com/track?tracknum=",
  FedEx: "https://www.fedex.com/fedextrack/?trknbr=",
  DHL: "https://www.dhl.com/global-en/home/tracking/tracking-express.html?tracking-id="
};

function money_(n, currency) {
  if (n === "" || n == null || isNaN(Number(n))) return "";
  var v = Number(n);
  var sym = currency === "USD" || !currency ? "$" : currency + " ";
  return sym + (v % 1 ? v.toFixed(2) : String(v));
}

function fill_(template, o, s) {
  var currency = o.get("Currency") || s.currency;
  var shipping = o.get("Shipping");
  var total = shipping === "" ? "" : Number(o.get("Subtotal")) + Number(shipping);
  var payBy = new Date(Date.now() + s.pay_days * 864e5);
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var carrier = String(o.get("Carrier") || "");
  var number = String(o.get("Tracking number") || "").trim();
  var trackUrl = TRACKING_URLS[carrier] ? TRACKING_URLS[carrier] + encodeURIComponent(number) : "";
  var addr = [o.get("Name"), o.get("Address line 1"), o.get("Address line 2"), o.get("Suburb / district"),
    [o.get("City"), o.get("State / region"), o.get("Postal code")].filter(String).join(" "), o.get("Country")]
    .map(function (v) { return String(v || "").replace(/^'/, ""); }).filter(String).join("\n");
  var vals = {
    first_name: String(o.get("Name")).replace(/^'/, "").split(" ")[0],
    name: String(o.get("Name")).replace(/^'/, ""),
    order_id: o.get("Order ID"),
    qty: o.get("Qty"),
    product: s.product_name,
    unit_price: money_(o.get("Unit price"), currency),
    subtotal: money_(o.get("Subtotal"), currency),
    shipping: money_(shipping, currency),
    total: money_(total, currency),
    country: o.get("Country"),
    payment_method: o.get("Payment method"),
    pay_to: String(o.get("Pay to")).replace(/^'/, ""),
    pay_by: Utilities.formatDate(payBy, tz, "EEEE, MMMM d"),
    address: addr,
    carrier: carrier || "the carrier",
    tracking_number: number,
    tracking_url: trackUrl,
    seller_name: s.seller_name
  };
  return String(template).replace(/\{\{(\w+)\}\}/g, function (m, k) { return vals[k] != null ? String(vals[k]) : m; });
}

function paymentProblems_(o, s) {
  var p = [];
  if (o.get("Status") === "Cancelled") p.push("cancelled");
  if (o.get("Shipping") === "") p.push("no shipping amount yet");
  if (/^\[/.test(String(o.get("Pay to")))) p.push("payment handle is still a placeholder");
  if (o.get("Payment email sent")) p.push("payment email already " + (/^Drafted/.test(o.get("Payment email sent")) ? "drafted" : "sent") + " (clear that cell to redo)");
  return p;
}

function trackingProblems_(o) {
  var p = [];
  if (o.get("Status") === "Cancelled") p.push("cancelled");
  if (!String(o.get("Tracking number")).trim()) p.push("no tracking number");
  if (!o.get("Carrier")) p.push("no carrier");
  if (o.get("Tracking email sent")) p.push("tracking email already " + (/^Drafted/.test(o.get("Tracking email sent")) ? "drafted" : "sent") + " (clear that cell to redo)");
  return p;
}

// ---------------------------------------------------------------- Menu actions

function draftPaymentEmails() { paymentEmails_(false); }
function sendPaymentEmails() { paymentEmails_(true); }
function draftTrackingEmails() { trackingEmails_(false); }
function sendTrackingEmails() { trackingEmails_(true); }

function paymentEmails_(send) {
  var s = settings_();
  emailRows_(send, "payment", paymentProblems_, function (o) {
    return { subject: fill_(s.payment_email_subject, o, s), body: fill_(s.payment_email_body, o, s) };
  }, function (o, sent) {
    setCell_(o, "Payment email sent", sent ? new Date() : "Drafted " + today_());
    if (o.get("Status") === "New") setCell_(o, "Status", "Payment requested");
  }, s);
}

function trackingEmails_(send) {
  var s = settings_();
  emailRows_(send, "tracking", function (o) { return trackingProblems_(o); }, function (o) {
    return { subject: fill_(s.tracking_email_subject, o, s), body: fill_(s.tracking_email_body, o, s) };
  }, function (o, sent) {
    setCell_(o, "Tracking email sent", sent ? new Date() : "Drafted " + today_());
    setCell_(o, "Status", "Shipped");
  }, s);
}

function emailRows_(send, kind, problems, build, after, s) {
  var ui = SpreadsheetApp.getUi();
  var picked = selectedOrders_();
  if (!picked.length) { ui.alert("Select one or more order rows in the Orders tab first."); return; }
  var ready = [], skipped = [];
  picked.forEach(function (o) {
    var p = problems(o, s);
    if (p.length) skipped.push(o.get("Order ID") + ": " + p.join(", "));
    else ready.push(o);
  });
  if (!ready.length) { ui.alert("Nothing to " + (send ? "send" : "draft") + ".\n\n" + skipped.join("\n")); return; }

  if (send) {
    var list = ready.map(function (o) { return o.get("Order ID") + "  " + o.get("Email"); }).join("\n");
    var answer = ui.alert("Send " + ready.length + " " + kind + " email" + (ready.length > 1 ? "s" : "") + "?",
      "These go out now from your Gmail:\n\n" + list + (skipped.length ? "\n\nSkipping:\n" + skipped.join("\n") : ""),
      ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) return;
  }
  var done = 0;
  ready.forEach(function (o) {
    var msg = build(o);
    var to = String(o.get("Email")).replace(/^'/, "");
    var opts = { name: s.seller_name };
    if (send) GmailApp.sendEmail(to, msg.subject, msg.body, opts);
    else GmailApp.createDraft(to, msg.subject, msg.body, opts);
    after(o, send);
    done++;
  });
  ui.alert((send ? "Sent " : "Drafted ") + done + " " + kind + " email" + (done > 1 ? "s" : "") + "." +
    (send ? "" : " They're in your Gmail Drafts, ready for you to check and send.") +
    (skipped.length ? "\n\nSkipped:\n" + skipped.join("\n") : ""));
}

function today_() {
  return Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm");
}

function markPaid() {
  var picked = selectedOrders_();
  picked.forEach(function (o) {
    if (o.get("Status") === "Cancelled") return;
    if (!o.get("Paid on")) setCell_(o, "Paid on", new Date());
    if (o.get("Status") === "New" || o.get("Status") === "Payment requested") setCell_(o, "Status", "Paid");
  });
  SpreadsheetApp.getUi().alert("Marked " + picked.length + " row" + (picked.length === 1 ? "" : "s") + " as paid.");
}

// Sends the selected row's payment email (and tracking email, if it has a
// tracking number) to you only, so you can check the wording. Changes nothing.
function sendTestToMe() {
  var s = settings_();
  var me = Session.getEffectiveUser().getEmail();
  var o = selectedOrders_()[0];
  if (!o) { SpreadsheetApp.getUi().alert("Select an order row first."); return; }
  GmailApp.sendEmail(me, "[TEST] " + fill_(s.payment_email_subject, o, s), fill_(s.payment_email_body, o, s), { name: s.seller_name });
  if (String(o.get("Tracking number")).trim()) {
    GmailApp.sendEmail(me, "[TEST] " + fill_(s.tracking_email_subject, o, s), fill_(s.tracking_email_body, o, s), { name: s.seller_name });
  }
  SpreadsheetApp.getUi().alert("Sent a test to " + me + ". Nothing was sent to the buyer.");
}
