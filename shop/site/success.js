(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var o = null;
  try { o = JSON.parse(sessionStorage.getItem("shop-last-order")); } catch (e) {}
  if (!o || !o.id) { $("none").hidden = false; return; }

  function money(n) {
    if (n == null || isNaN(n)) return "TBD";
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: o.currency || "USD", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); }
    catch (e) { return "$" + n; }
  }
  var first = String(o.name || "").split(" ")[0];
  $("headline").textContent = first ? "You're in, " + first + "." : "You're in.";
  $("intro").textContent = (o.qty === 1 ? "One case is" : o.qty + " cases are") + " set aside for you. Nothing has been charged yet.";
  $("orderId").textContent = o.id;
  $("itemLabel").textContent = o.productName || "Keycap case";
  $("itemLine").textContent = o.qty + " × " + money(o.unitPrice);
  $("subtotal").textContent = money(o.subtotal);
  $("method").textContent = (o.paymentMethod || "") + " (friends and family)";

  // Plain lines first; swapped for the country's own address order once the
  // address rules load.
  var a = o.address || {};
  $("address").textContent = [o.name, a.address1, a.address2, a.sublocality,
    [a.city, a.regionName || a.region, a.postal].filter(Boolean).join(" "), a.country].filter(Boolean).join("\n");
  if (window.AddressRules && a.country) {
    fetch("address-data.json").then(function (r) { return r.json(); }).then(function (data) {
      $("address").textContent = window.AddressRules.create(data).format(a, o.name);
    }).catch(function () {});
  }
  $("contact").textContent = [o.email, o.phone].filter(Boolean).join(" · ");

  var days = o.payDays || 3;
  $("payStep").textContent = "Send the total by " + (o.paymentMethod || "your chosen app") +
    " as Friends and Family within " + days + " day" + (days === 1 ? "" : "s") + " of that email, with " + o.id + " in the note.";

  if (o.paymentHandle && !/^\[/.test(o.paymentHandle)) {
    $("handleRow").hidden = false;
    $("handleLabel").textContent = o.paymentMethod + ":";
    $("handle").textContent = o.paymentHandle;
    $("copyHandle").addEventListener("click", function () {
      var btn = this;
      navigator.clipboard.writeText(o.paymentHandle).then(function () { btn.textContent = "Copied"; })
        .catch(function () {
          var r = document.createRange(); r.selectNodeContents($("handle"));
          var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        });
    });
  }
  $("done").hidden = false;
})();
