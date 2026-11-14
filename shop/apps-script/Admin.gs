/** @OnlyCurrentDoc */
/**
 * Sheet setup and the Shop menu.
 *
 * The script has no email access: @OnlyCurrentDoc above limits it to this one
 * spreadsheet, so Google's access screen asks only for this sheet and for
 * showing the Shop menu. Email buyers yourself, using the rows as the record.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Shop")
    .addItem("Mark selected rows as paid", "markPaid")
    .addSeparator()
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

  var ad = ss.getSheetByName("AddressData");
  if (ad) ad.hideSheet();

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


function markPaid() {
  var picked = selectedOrders_();
  picked.forEach(function (o) {
    if (o.get("Status") === "Cancelled") return;
    if (!o.get("Paid on")) setCell_(o, "Paid on", new Date());
    if (o.get("Status") === "New" || o.get("Status") === "Payment requested") setCell_(o, "Status", "Paid");
  });
  SpreadsheetApp.getUi().alert("Marked " + picked.length + " row" + (picked.length === 1 ? "" : "s") + " as paid.");
}

