(function () {
  "use strict";
  var cfg = window.SHOP_CONFIG || {};
  var fb = cfg.fallback || {};
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    status: Object.assign({ remaining: null, open: true }, fb),
    rules: null,
    requestId: newId(),
    busy: false,
    soldOut: false
  };

  function newId() {
    try { return crypto.randomUUID(); } catch (e) { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
  }
  function money(n) {
    if (n == null || isNaN(n)) return "TBD";
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: state.status.currency || "USD", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); }
    catch (e) { return "$" + n; }
  }
  function maxQty() {
    var s = state.status;
    var cap = s.maxPerOrder || 4;
    if (s.remaining != null) cap = Math.min(cap, s.remaining);
    return Math.max(0, cap);
  }
  function qty() { return parseInt($("qty").value, 10) || 0; }

  // ---------- Photos
  function renderPhotos() {
    var photos = cfg.photos || [];
    var thumbs = $("thumbs");
    thumbs.innerHTML = "";
    photos.forEach(function (p, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
      b.setAttribute("aria-label", "Show photo " + (i + 1) + " of " + photos.length);
      var img = document.createElement("img");
      img.src = p.small; img.alt = ""; img.loading = "lazy"; img.width = 400; img.height = 267;
      b.appendChild(img);
      b.addEventListener("click", function () {
        var main = $("mainPhoto");
        main.src = p.small;
        main.srcset = p.small + " 800w, " + p.src + " 1600w";
        main.width = p.w; main.height = p.h; main.alt = p.alt;
        Array.prototype.forEach.call(thumbs.children, function (c, j) { c.setAttribute("aria-pressed", j === i ? "true" : "false"); });
      });
      thumbs.appendChild(b);
    });
  }

  // ---------- Status, stock, totals
  function applyStatus(s) {
    state.status = Object.assign({}, state.status, s);
    s = state.status;
    if (s.shopName) $("shopName").textContent = s.shopName;
    if (s.productName) { $("productName").textContent = s.productName; document.title = s.productName; }
    if (s.description) $("description").textContent = s.description;
    $("unitPrice").textContent = money(s.unitPrice);
    $("qtyHelp").textContent = "Up to " + (s.maxPerOrder || 4) + " per order.";

    if (s.remaining != null) {
      $("stockText").textContent = s.remaining > 0 ? s.remaining + " of " + s.total + " left" : "Sold out";
      $("stockBar").style.width = (s.total ? Math.round(100 * (s.total - s.remaining) / s.total) : 0) + "%";
      $("stockLimit").textContent = s.remaining > 0 ? s.total - s.remaining + " claimed" : "";
    }
    state.soldOut = s.remaining === 0;
    renderSaleNote();
    clampQty();
    limitCountries();
    var key = JSON.stringify(s.paymentMethods || []);
    if (state.rules && key !== state.methodsKey) { state.methodsKey = key; renderPayOptions(); }
    updateTotals();
  }

  var countdownTimer = null;
  function renderSaleNote() {
    var s = state.status, note = $("saleNote");
    note.className = "status-note";
    clearInterval(countdownTimer);
    if (state.soldOut) {
      note.hidden = false; note.classList.add("soldout");
      note.textContent = "All " + s.total + " are spoken for. Thanks for checking!";
    } else if (s.paused) {
      note.hidden = false; note.textContent = "Orders are paused for a moment. Check back soon.";
    } else if (!s.open && s.opensAt) {
      note.hidden = false;
      var tick = function () {
        var ms = new Date(s.opensAt) - Date.now();
        if (ms <= 0) { clearInterval(countdownTimer); refreshStatus(); return; }
        var when = new Date(s.opensAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        var d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, sec = Math.floor(ms / 1e3) % 60;
        note.textContent = "Orders open " + when + " your time, in " + (d ? d + "d " : "") + h + "h " + m + "m " + sec + "s. You can fill in the form now.";
      };
      tick(); countdownTimer = setInterval(tick, 1000);
    } else if (!s.open) {
      note.hidden = false; note.textContent = "Orders are closed.";
    } else {
      note.hidden = true;
    }
    var canOrder = s.open && !s.paused && !state.soldOut;
    $("submitBtn").disabled = !canOrder || state.busy;
    $("submitBtn").textContent = state.busy ? "Placing order…" : state.soldOut ? "Sold out" : !s.open || s.paused ? "Not open yet" : "Place order";
  }

  function clampQty() {
    var max = maxQty(), q = qty();
    $("qty").max = String(Math.max(1, max));
    if (max > 0 && (q < 1 || q > max)) $("qty").value = String(Math.min(Math.max(q, 1), max));
    $("qtyMinus").disabled = qty() <= 1;
    $("qtyPlus").disabled = qty() >= max;
  }

  function updateTotals() {
    var q = Math.max(0, qty()), p = state.status.unitPrice;
    $("totalLine").textContent = q + " × " + money(p);
    $("subtotal").textContent = money(p == null ? null : q * p);
  }

  function refreshStatus() {
    return window.ShopApi.status().then(function (s) {
      if (s && s.ok) applyStatus(s);
    }).catch(function () {
      if (state.status.remaining == null) $("stockText").textContent = "Couldn't load how many are left. Refresh to try again.";
    });
  }

  // ---------- Address
  function renderCountries() {
    var sel = $("country");
    var home = state.status.homeCountry || "US";
    state.rules.countryList("en", home).forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.code; o.textContent = c.name;
      sel.appendChild(o);
    });
    sel.value = home;
    limitCountries();
    sel.addEventListener("change", function () { renderAddress(); renderPayOptions(); updatePhoneHint(); });
    renderAddress();
    updatePhoneHint();
  }

  // When the sheet lists allowed_countries, only those can be picked.
  function limitCountries() {
    var allowed = state.status.allowedCountries, sel = $("country");
    if (!state.rules || !sel.options.length) return;
    Array.prototype.forEach.call(sel.options, function (o) {
      var off = !!(allowed && allowed.length && allowed.indexOf(o.value) === -1);
      o.disabled = off; o.hidden = off;
    });
    if (sel.selectedOptions[0] && sel.selectedOptions[0].disabled) {
      var first = Array.prototype.find.call(sel.options, function (o) { return !o.disabled; });
      if (first) { sel.value = first.value; renderAddress(); renderPayOptions(); updatePhoneHint(); }
    }
  }

  function renderAddress() {
    var box = $("addressFields");
    var keep = {};
    Array.prototype.forEach.call(box.querySelectorAll("input,select"), function (el) { keep[el.name] = el.value; });
    box.innerHTML = "";
    var rows = state.rules.layout($("country").value);
    rows.forEach(function (row) {
      row.forEach(function (f) {
        var label = document.createElement("label");
        label.className = "field" + (row.length === 1 ? " span-2" : "");
        label.htmlFor = "addr-" + f.key;
        var span = document.createElement("span");
        span.textContent = f.label;
        if (!f.required) { var sm = document.createElement("small"); sm.textContent = " (optional)"; span.appendChild(sm); }
        label.appendChild(span);
        var input;
        if (f.options) {
          input = document.createElement("select");
          var blank = document.createElement("option"); blank.value = ""; blank.textContent = "Choose…";
          input.appendChild(blank);
          f.options.forEach(function (o) {
            var opt = document.createElement("option"); opt.value = o.value; opt.textContent = o.label; input.appendChild(opt);
          });
        } else {
          input = document.createElement("input");
          input.maxLength = 120;
          if (f.placeholder) input.placeholder = f.placeholder;
          if (f.key === "postal") { input.autocapitalize = "characters"; input.spellcheck = false; }
        }
        input.id = "addr-" + f.key; input.name = f.key;
        if (f.autocomplete) input.autocomplete = "shipping " + f.autocomplete;
        if (f.required) input.required = true;
        if (keep[f.key] != null) input.value = keep[f.key];
        label.appendChild(input);
        var err = document.createElement("em"); err.className = "error"; err.id = "err-" + f.key; err.hidden = true;
        label.appendChild(err);
        box.appendChild(label);
        input.addEventListener("blur", function () { if (input.value) checkAddress(f.key); });
      });
    });
  }

  function addressValues() {
    var v = {};
    Array.prototype.forEach.call($("addressFields").querySelectorAll("input,select"), function (el) { v[el.name] = el.value; });
    return v;
  }

  function checkAddress(onlyKey) {
    var res = state.rules.validate($("country").value, addressValues());
    ["address1", "address2", "sublocality", "city", "region", "postal"].forEach(function (k) {
      if (onlyKey && k !== onlyKey) return;
      showError(k, res.errors[k]);
    });
    return res;
  }

  function isHome() { return $("country").value === (state.status.homeCountry || "US"); }
  function updatePhoneHint() {
    $("phoneHint").textContent = isHome() ? "(optional, helps the carrier reach you)" : "(needed for international shipping and customs)";
  }

  // ---------- Payment methods
  function renderPayOptions() {
    var box = $("payOptions");
    var current = (box.querySelector("input:checked") || {}).value;
    var methods = state.status.paymentMethods || [];
    box.innerHTML = "";
    methods.forEach(function (m) {
      var wrap = document.createElement("div"); wrap.className = "pay-option";
      var input = document.createElement("input");
      input.type = "radio"; input.name = "paymentMethod"; input.id = "pay-" + m.id; input.value = m.id; input.required = true;
      var blocked = m.usOnly && $("country").value !== "US";
      input.disabled = blocked;
      if (current === m.id && !blocked) input.checked = true;
      var label = document.createElement("label"); label.htmlFor = input.id;
      var strong = document.createElement("strong"); strong.textContent = m.label;
      var small = document.createElement("small");
      small.textContent = blocked ? "US addresses only" : "Friends and family";
      label.appendChild(strong); label.appendChild(small);
      wrap.appendChild(input); wrap.appendChild(label);
      box.appendChild(wrap);
      input.addEventListener("change", function () { showError("paymentMethod", null); });
    });
  }

  // ---------- Validation and submit
  function showError(key, msg) {
    var el = $("err-" + key);
    if (el) { el.textContent = msg || ""; el.hidden = !msg; }
    var input = key === "paymentMethod" ? null : ($(key) || $("addr-" + key));
    if (input) {
      if (msg) { input.setAttribute("aria-invalid", "true"); input.setAttribute("aria-describedby", "err-" + key); }
      else input.removeAttribute("aria-invalid");
    }
  }

  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
  function collect() {
    var errors = {};
    var name = $("name").value.trim().replace(/\s+/g, " ");
    var email = $("email").value.trim();
    var email2 = $("email2").value.trim();
    var phone = $("phone").value.trim();
    var q = qty();
    if (name.length < 2) errors.name = "Enter your full name.";
    if (!EMAIL.test(email)) errors.email = "Enter an email address like name@example.com.";
    else if (email.toLowerCase() !== email2.toLowerCase()) errors.email2 = "The two email addresses don't match.";
    var digits = phone.replace(/\D/g, "");
    if (!isHome() && digits.length < 7) errors.phone = "Add a phone number with country code. Carriers need it for international parcels.";
    else if (phone && (digits.length < 7 || digits.length > 15)) errors.phone = "Enter a phone number with 7 to 15 digits.";
    if (q < 1 || q > maxQty()) errors.qty = maxQty() > 0 ? "Choose between 1 and " + maxQty() + "." : "None left to order.";
    var addr = checkAddress();
    Object.assign(errors, addr.errors);
    var pm = ($("payOptions").querySelector("input:checked") || {}).value;
    if (!pm) errors.paymentMethod = "Choose how you'll pay.";
    if (!$("ack").checked) errors.ack = "Tick this box to confirm you'll pay by friends and family.";
    ["name", "email", "email2", "phone", "qty", "paymentMethod", "ack"].forEach(function (k) { showError(k, errors[k]); });
    return {
      errors: errors,
      payload: {
        requestId: state.requestId, qty: q, name: name, email: email, phone: phone,
        address: addr.address, paymentMethod: pm, ack: $("ack").checked,
        notes: $("notes").value.trim(), website: $("website").value
      }
    };
  }

  function firstInvalid() {
    return document.querySelector('[aria-invalid="true"]') || (!$("ack").checked ? $("ack") : null) ||
      (!$("payOptions").querySelector("input:checked") ? $("payOptions").querySelector("input:not(:disabled)") : null);
  }

  function formError(msg) {
    var el = $("formError");
    el.textContent = msg || ""; el.hidden = !msg;
    if (msg) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function setBusy(b) { state.busy = b; renderSaleNote(); }

  function submit(e) {
    e.preventDefault();
    formError(null);
    if (state.busy) return;
    if (!state.rules) { formError("The address form is still loading. Try again in a moment."); return; }
    var c = collect();
    if (Object.keys(c.errors).length) {
      var el = firstInvalid();
      if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ behavior: "smooth", block: "center" }); }
      formError("Fix the highlighted fields, then place your order.");
      return;
    }
    setBusy(true);
    window.ShopApi.order(c.payload).then(function (res) {
      setBusy(false);
      if (res && res.ok) {
        try { sessionStorage.setItem("shop-last-order", JSON.stringify(res.order)); } catch (err) {}
        location.href = "success.html";
        return;
      }
      handleError(res || {});
    }).catch(function () {
      setBusy(false);
      formError("Couldn't reach the order sheet, so your order may not have gone through. Press Place order again. If it did go through, you won't be charged twice.");
    });
  }

  function handleError(res) {
    switch (res.error) {
      case "sold_out":
        applyStatus({ remaining: 0 });
        formError("Sorry, they sold out before your order came in. Nothing was reserved and you owe nothing.");
        break;
      case "not_enough":
        applyStatus({ remaining: res.remaining });
        formError("Only " + res.remaining + " left now. Lower the quantity and place your order again.");
        state.requestId = newId();
        break;
      case "email_limit":
        formError("This email already has " + res.alreadyOrdered + " on order, and the limit is " + res.max + " per person." +
          (res.max - res.alreadyOrdered > 0 ? " You can add up to " + (res.max - res.alreadyOrdered) + " more." : ""));
        state.requestId = newId();
        break;
      case "not_open":
        applyStatus({ open: false, opensAt: res.opensAt });
        formError("Orders aren't open yet. Your details are still here, so you can place the order when it opens.");
        break;
      case "closed":
        applyStatus({ open: false, opensAt: null });
        formError("Orders are closed.");
        break;
      case "paused":
        applyStatus({ paused: true });
        formError("Orders are paused for a moment. Try again shortly.");
        break;
      case "busy":
        formError("Lots of orders are coming in right now. Wait a few seconds and press Place order again.");
        break;
      case "invalid":
        Object.keys(res.fields || {}).forEach(function (k) { showError(k, res.fields[k]); });
        formError("Some details need fixing. Check the highlighted fields.");
        state.requestId = newId();
        break;
      default:
        formError("Something went wrong placing your order. Try again, or message Ankit.");
    }
  }

  // ---------- Wire up
  function init() {
    if (window.ShopApi.preview) $("previewBanner").hidden = false;
    renderPhotos();
    applyStatus({});
    $("qtyMinus").addEventListener("click", function () { $("qty").value = String(qty() - 1); clampQty(); updateTotals(); });
    $("qtyPlus").addEventListener("click", function () { $("qty").value = String(qty() + 1); clampQty(); updateTotals(); });
    $("qty").addEventListener("input", updateTotals);
    $("qty").addEventListener("change", function () { clampQty(); updateTotals(); });
    $("ack").addEventListener("change", function () { if ($("ack").checked) showError("ack", null); });
    $("order").addEventListener("submit", submit);
    // Any edit after a definitive answer starts a fresh order attempt.
    $("order").addEventListener("input", function () { formError(null); });

    fetch("address-data.json").then(function (r) { return r.json(); }).then(function (data) {
      state.rules = window.AddressRules.create(data);
      renderCountries();
      state.methodsKey = JSON.stringify(state.status.paymentMethods || []);
      renderPayOptions();
    }).catch(function () {
      formError("The address form didn't load. Refresh the page to try again.");
    });

    refreshStatus();
    setInterval(function () { if (!document.hidden && !state.busy) refreshStatus(); }, 20000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refreshStatus(); });
  }

  init();
})();
