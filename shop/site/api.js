/*
 * Talks to the Google Apps Script backend, or to an in-browser stand-in when
 * no backend URL is set (preview mode).
 *
 * Preview states (only while apiUrl is empty): ?demo=soldout, ?demo=low,
 * ?demo=closed, ?demo=reset
 */
(function () {
  "use strict";
  var cfg = window.SHOP_CONFIG || {};
  var params = new URLSearchParams(location.search);
  var preview = !cfg.apiUrl;

  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); })]);
  }

  var remote = {
    status: function () {
      return withTimeout(fetch(cfg.apiUrl + "?action=status&t=" + Date.now(), { method: "GET" }), 15000)
        .then(function (r) { return r.json(); });
    },
    order: function (payload) {
      // text/plain keeps this a "simple" request, so the browser skips the
      // CORS preflight that Apps Script can't answer.
      return withTimeout(fetch(cfg.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ action: "order" }, payload))
      }), 30000).then(function (r) { return r.json(); });
    }
  };

  // ---- Preview backend: same answers as the real one, kept in localStorage.
  var KEY = "shop-preview-orders";
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
  var memory = null;
  function orders() { return memory || (memory = load()); }

  var mode = params.get("demo");
  if (mode === "reset") { save([]); memory = []; }
  var fb = cfg.fallback || {};

  function previewStatus() {
    var total = fb.total || 60;
    var sold = orders().reduce(function (s, o) { return s + o.qty; }, 0);
    if (mode === "low") sold = Math.max(sold, total - 3);
    if (mode === "soldout") sold = total;
    var opensAt = mode === "closed" ? new Date(Date.now() + 26 * 3600e3).toISOString() : null;
    return {
      ok: true, preview: true,
      shopName: fb.shopName, productName: fb.productName, description: fb.description,
      unitPrice: fb.unitPrice, currency: fb.currency, shippingNote: fb.shippingNote,
      total: total, remaining: Math.max(0, total - sold), maxPerOrder: fb.maxPerOrder || 4,
      homeCountry: fb.homeCountry || "US", payDays: fb.payDays || 3,
      open: !opensAt, opensAt: opensAt, closesAt: null, paused: false,
      paymentMethods: fb.paymentMethods
    };
  }

  var local = {
    status: function () { return new Promise(function (res) { setTimeout(function () { res(previewStatus()); }, 250); }); },
    order: function (p) {
      return new Promise(function (res) {
        setTimeout(function () {
          var s = previewStatus();
          var existing = orders().find(function (o) { return o.requestId === p.requestId; });
          if (existing) return res({ ok: true, order: existing.summary, remaining: s.remaining });
          if (!s.open) return res({ ok: false, error: "not_open", opensAt: s.opensAt });
          if (s.remaining <= 0) return res({ ok: false, error: "sold_out", remaining: 0 });
          if (p.qty > s.remaining) return res({ ok: false, error: "not_enough", remaining: s.remaining });
          var mine = orders().filter(function (o) { return o.email === p.email.toLowerCase(); })
            .reduce(function (n, o) { return n + o.qty; }, 0);
          if (mine + p.qty > s.maxPerOrder) return res({ ok: false, error: "email_limit", alreadyOrdered: mine, max: s.maxPerOrder });
          var id = "KC-" + String(orders().length + 1).padStart(3, "0");
          var method = (s.paymentMethods || []).find(function (m) { return m.id === p.paymentMethod; }) || {};
          var summary = {
            id: id, placedAt: new Date().toISOString(), qty: p.qty, productName: s.productName,
            unitPrice: s.unitPrice, subtotal: p.qty * s.unitPrice, currency: s.currency,
            name: p.name, email: p.email, phone: p.phone, address: p.address,
            paymentMethod: method.label, paymentHandle: method.handle, payDays: s.payDays
          };
          orders().push({ requestId: p.requestId, email: p.email.toLowerCase(), qty: p.qty, summary: summary });
          save(orders());
          res({ ok: true, order: summary, remaining: s.remaining - p.qty });
        }, 600);
      });
    }
  };

  window.ShopApi = { preview: preview, status: (preview ? local : remote).status, order: (preview ? local : remote).order };
})();
