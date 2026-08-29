/* ankit.casa service map — renderer + interactions
   Data comes from data.js (ZONES, TAILNET_BOUNDARY, LINES, NODES, LINE_PATHS, KIND_LABEL). */
(function () {
  "use strict";

  const SVGNS = "http://www.w3.org/2000/svg";
  const nodeById = {};
  NODES.forEach((n) => (nodeById[n.id] = n));

  const W = 1850, H = 1530;

  /* ---------- svg scaffold ---------- */
  const svg = document.getElementById("map");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const defs = el("defs");
  const pat = el("pattern", { id: "dots", width: 40, height: 40, patternUnits: "userSpaceOnUse" });
  pat.appendChild(el("circle", { cx: 1.2, cy: 1.2, r: 1.2, fill: "#201d18" }));
  defs.appendChild(pat);
  svg.appendChild(defs);

  svg.appendChild(el("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#dots)" }));

  const viewport = el("g", { id: "viewport" });
  svg.appendChild(viewport);

  const gZones = el("g", { class: "zones" });
  const gLines = el("g", { class: "lines" });
  const gActive = el("g", { class: "active-layer", "pointer-events": "none" });
  const gStations = el("g", { class: "stations" });
  const gLabels = el("g", { class: "labels", "pointer-events": "none" });
  viewport.appendChild(gZones);
  viewport.appendChild(gLines);
  viewport.appendChild(gActive);
  viewport.appendChild(gStations);
  viewport.appendChild(gLabels);

  function el(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function txt(content, attrs) {
    const t = el("text", attrs);
    t.textContent = content;
    return t;
  }

  /* ---------- zones + tailnet boundary ---------- */
  ZONES.forEach((z) => {
    gZones.appendChild(el("rect", {
      x: z.x, y: z.y, width: z.w, height: z.h, rx: 18, class: "zone",
    }));
    gZones.appendChild(txt(z.name, { x: z.x + 18, y: z.y + 30, class: "zone-name" }));
    gZones.appendChild(txt(z.note, { x: z.x + 18, y: z.y + 48, class: "zone-note" }));
  });
  const tb = TAILNET_BOUNDARY;
  gZones.appendChild(el("rect", {
    x: tb.x, y: tb.y, width: tb.w, height: tb.h, rx: 26, class: "tailnet-boundary",
  }));
  const tbAt = tb.labelAt || [tb.x + tb.w / 2, tb.y + tb.h - 14];
  const tbLabel = txt(tb.label, { x: tbAt[0], y: tbAt[1], class: "tailnet-label", "text-anchor": "middle" });
  gZones.appendChild(tbLabel);

  /* ---------- geometry ---------- */
  function pt(item) {
    if (typeof item === "string") { const n = nodeById[item]; return { x: n.x, y: n.y }; }
    return { x: item[0], y: item[1] };
  }
  function key(item) { return typeof item === "string" ? item : `lit:${item[0]},${item[1]}`; }

  // Route one leg with subway geometry: straight + a single 45° diagonal.
  function routeLeg(p, q) {
    const dx = q.x - p.x, dy = q.y - p.y;
    if (dx === 0 || dy === 0) return [p, q];
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx >= ady) {
      const bend = { x: q.x - Math.sign(dx) * ady, y: p.y };
      return bend.x === p.x ? [p, q] : [p, bend, q];
    }
    const bend = { x: p.x, y: q.y - Math.sign(dy) * adx };
    return bend.y === p.y ? [p, q] : [p, bend, q];
  }

  // Route a full element list into a list of legs (each leg = array of points).
  function routeElements(items) {
    const legs = [];
    for (let i = 0; i < items.length - 1; i++) {
      legs.push({ from: items[i], to: items[i + 1], points: routeLeg(pt(items[i]), pt(items[i + 1])) });
    }
    return legs;
  }

  // Perpendicular unit vectors per polyline run, scaled by the line's offset.
  function offsetPoints(points, off) {
    if (!off) return points;
    // split into runs (segments); compute per-segment normals; miter at joints
    const segN = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      segN.push({ x: (-dy / len) * off, y: (dx / len) * off });
    }
    return points.map((p, i) => {
      let n;
      if (i === 0) n = segN[0];
      else if (i === points.length - 1) n = segN[segN.length - 1];
      else {
        let nx = segN[i - 1].x + segN[i].x, ny = segN[i - 1].y + segN[i].y;
        const l = Math.hypot(nx, ny);
        if (l < 0.01) { nx = segN[i - 1].x; ny = segN[i - 1].y; }
        else { nx = (nx / l) * Math.abs(off); ny = (ny / l) * Math.abs(off); }
        n = { x: nx, y: ny };
      }
      return { x: p.x + n.x, y: p.y + n.y };
    });
  }

  function pathD(points, r) {
    if (points.length < 2) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const p0 = points[i - 1], p1 = points[i], p2 = points[i + 1];
      const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const rr = Math.min(r, d1 / 2, d2 / 2);
      const a = { x: p1.x - ((p1.x - p0.x) / d1) * rr, y: p1.y - ((p1.y - p0.y) / d1) * rr };
      const b = { x: p1.x + ((p2.x - p1.x) / d2) * rr, y: p1.y + ((p2.y - p1.y) / d2) * rr };
      d += ` L ${a.x} ${a.y} Q ${p1.x} ${p1.y} ${b.x} ${b.y}`;
    }
    d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
    return d;
  }

  /* ---------- build line geometry + element graph ---------- */
  // Per line: legs[] = {pathIdx, items, points (offset), fromKey, toKey, dashed}
  // graph: key -> [{toKey, legIdx(global per line)}]
  const lineGeom = {};
  Object.keys(LINE_PATHS).forEach((lk) => {
    const spec = LINE_PATHS[lk];
    const off = LINES[lk].offset || 0;
    const geom = { legs: [], graph: new Map() };
    const addPath = (items, dashed, pathIdx) => {
      routeElements(items).forEach((leg) => {
        const gi = geom.legs.length;
        geom.legs.push({
          pathIdx, dashed,
          fromKey: key(leg.from), toKey: key(leg.to),
          points: offsetPoints(leg.points, off),
        });
        const fk = key(leg.from), tk = key(leg.to);
        if (!geom.graph.has(fk)) geom.graph.set(fk, []);
        if (!geom.graph.has(tk)) geom.graph.set(tk, []);
        geom.graph.get(fk).push({ to: tk, leg: gi });
        geom.graph.get(tk).push({ to: fk, leg: gi });
      });
    };
    spec.paths.forEach((p, i) => addPath(p, false, i));
    (spec.dashed || []).forEach((p, i) => addPath(p, true, `d${i}`));
    lineGeom[lk] = geom;
  });

  // BFS between two stations over one line's graph; returns {legIdxs, nodeIds}
  function traceLine(lineKey, fromId, toId) {
    const g = lineGeom[lineKey].graph;
    if (!g.has(fromId) || !g.has(toId)) return null;
    const prev = new Map([[fromId, null]]);
    const queue = [fromId];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === toId) break;
      (g.get(cur) || []).forEach(({ to, leg }) => {
        if (!prev.has(to)) { prev.set(to, { from: cur, leg }); queue.push(to); }
      });
    }
    if (!prev.has(toId)) return null;
    const legIdxs = [], nodeIds = [];
    let cur = toId;
    while (prev.get(cur)) {
      legIdxs.unshift(prev.get(cur).leg);
      nodeIds.unshift(cur);
      cur = prev.get(cur).from;
    }
    nodeIds.unshift(fromId);
    return { legIdxs, nodeIds };
  }

  /* ---------- render lines ---------- */
  const legEls = {}; // lineKey -> [pathEls in leg order]
  Object.keys(lineGeom).forEach((lk) => {
    const color = LINES[lk].color;
    legEls[lk] = [];
    lineGeom[lk].legs.forEach((leg, i) => {
      const p = el("path", {
        d: pathD(leg.points, 12),
        class: "line-leg" + (leg.dashed ? " dashed" : ""),
        stroke: color,
        "data-line": lk,
      });
      gLines.appendChild(p);
      legEls[lk][i] = p;
    });
  });

  /* ---------- always-on segment labels ---------- */
  Object.keys(LINE_PATHS).forEach((lk) => {
    const labels = LINE_PATHS[lk].segLabels || {};
    Object.keys(labels).forEach((k) => {
      const { text, at } = labels[k];
      const t = txt(text, {
        x: at[0], y: at[1], class: "seg-label", fill: LINES[lk].color,
      });
      t.dataset.line = lk;
      gLabels.appendChild(t);
    });
  });

  /* ---------- line name tags ---------- */
  const LINE_TAGS = {
    public: [700, 210],
    tailnet: [330, 372],
    llm: [1460, 180],
    smarthome: [1240, 745],
    bots: [600, 1064],
    ops: [560, 1224],
  };
  Object.keys(LINE_TAGS).forEach((lk) => {
    const [x, y] = LINE_TAGS[lk];
    const g = el("g", { class: "line-tag", "data-line": lk });
    const t = txt(LINES[lk].name.toUpperCase(), { x: x + 10, y: y + 4, class: "line-tag-text" });
    g.appendChild(el("rect", {
      x, y: y - 11, width: LINES[lk].name.length * 7.8 + 20, height: 20, rx: 10,
      fill: LINES[lk].color,
    }));
    g.appendChild(t);
    gLabels.appendChild(g);
  });

  /* ---------- stations ---------- */
  const stationEls = {};
  NODES.forEach((n) => {
    const g = el("g", { class: "station", "data-id": n.id });
    const multi = n.lines.length > 1;
    if (multi) {
      g.appendChild(el("circle", {
        cx: n.x, cy: n.y, r: 10, class: "st-interchange" + (n.dashed ? " st-dashed" : ""),
      }));
      g.appendChild(el("circle", { cx: n.x, cy: n.y, r: 4, class: "st-core" }));
    } else {
      const c = LINES[n.lines[0]].color;
      g.appendChild(el("circle", {
        cx: n.x, cy: n.y, r: 7, class: "st-dot" + (n.dashed ? " st-dashed" : ""), stroke: c,
      }));
    }
    const [dx, dy, anchor] = n.label;
    const t = txt(n.name, {
      x: n.x + dx, y: n.y + dy,
      class: "st-label" + (multi ? " big" : "") + (n.dashed ? " dim-label" : ""),
      "text-anchor": anchor,
    });
    g.appendChild(t);
    gStations.appendChild(g);
    stationEls[n.id] = g;

    g.addEventListener("pointerenter", (ev) => showTooltip(n, ev));
    g.addEventListener("pointermove", (ev) => moveTooltip(ev));
    g.addEventListener("pointerleave", hideTooltip);
    g.addEventListener("click", (ev) => { ev.stopPropagation(); select(n.id); });
  });

  /* ---------- tooltip ---------- */
  const tooltip = document.getElementById("tooltip");
  function showTooltip(n, ev) {
    const url = (n.facts.find((f) => f[0] === "URL") || [])[1];
    tooltip.innerHTML = `<b>${n.name}</b><span>${KIND_LABEL[n.kind]}</span>` +
      (url ? `<em>${url}</em>` : "");
    tooltip.classList.add("on");
    moveTooltip(ev);
  }
  function moveTooltip(ev) {
    const r = svg.getBoundingClientRect();
    tooltip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 240) + "px";
    tooltip.style.top = (ev.clientY - r.top > r.height - 90 ? ev.clientY - 70 : ev.clientY + 16) + "px";
  }
  function hideTooltip() { tooltip.classList.remove("on"); }

  /* ---------- selection / journeys ---------- */
  let selected = null;      // node id
  let routeIdx = 0;
  let activeLegs = new Set();   // "line:legIdx"
  let activeNodes = new Set();  // node ids
  let rideStep = -1;

  function clearActive() {
    activeLegs = new Set();
    activeNodes = new Set();
    rideStep = -1;
    gActive.innerHTML = "";
    viewport.classList.remove("has-active");
    document.querySelectorAll(".station.active").forEach((s) => s.classList.remove("active"));
  }

  function computeRouteActive(node, route) {
    activeLegs = new Set();
    activeNodes = new Set([node.id]);
    route.hops.forEach((h) => {
      const tr = traceLine(h.line, h.from, h.to);
      if (!tr) return;
      tr.legIdxs.forEach((li) => activeLegs.add(`${h.line}:${li}`));
      tr.nodeIds.forEach((id) => { if (!id.startsWith("lit:")) activeNodes.add(id); });
      activeNodes.add(h.from); activeNodes.add(h.to);
    });
  }

  function computeLineOverview(node) {
    activeLegs = new Set();
    activeNodes = new Set([node.id]);
    node.lines.forEach((lk) => {
      lineGeom[lk].legs.forEach((leg, i) => {
        activeLegs.add(`${lk}:${i}`);
        [leg.fromKey, leg.toKey].forEach((k) => { if (!k.startsWith("lit:")) activeNodes.add(k); });
      });
    });
  }

  function renderActive() {
    gActive.innerHTML = "";
    viewport.classList.add("has-active");
    activeLegs.forEach((k) => {
      const [lk, li] = k.split(":");
      const leg = lineGeom[lk].legs[li];
      const d = pathD(leg.points, 12);
      gActive.appendChild(el("path", { d, class: "halo", stroke: LINES[lk].color }));
      gActive.appendChild(el("path", { d, class: "train", "data-line": lk }));
    });
    activeNodes.forEach((id) => {
      const g = stationEls[id];
      if (g) g.classList.add("active");
    });
    document.querySelectorAll(".station").forEach((g) => {
      g.classList.toggle("inactive", !activeNodes.has(g.dataset.id));
    });
    document.querySelectorAll(".line-leg").forEach((p) => {
      // dim any leg not active; find its key
      p.classList.remove("inactive");
    });
    Object.keys(legEls).forEach((lk) => legEls[lk].forEach((p, i) => {
      p.classList.toggle("inactive", !activeLegs.has(`${lk}:${i}`));
    }));
  }

  function select(id, opts) {
    opts = opts || {};
    const n = nodeById[id];
    if (!n) return;
    selected = id; routeIdx = 0; rideStep = -1;
    clearLineFilterSilently();
    clearActive();
    if (n.routes && n.routes.length) computeRouteActive(n, n.routes[0]);
    else computeLineOverview(n);
    renderActive();
    renderPanel(n);
    if (!opts.noHash) history.replaceState(null, "", "#s=" + id);
    if (opts.zoomTo) panTo(n.x, n.y, opts.zoomTo);
  }

  function deselect() {
    selected = null;
    clearActive();
    closePanel();
    history.replaceState(null, "", location.pathname);
    document.querySelectorAll(".station.inactive").forEach((s) => s.classList.remove("inactive"));
    Object.keys(legEls).forEach((lk) => legEls[lk].forEach((p) => p.classList.remove("inactive")));
  }

  svg.addEventListener("click", () => { if (!didDrag) deselect(); });

  /* ---------- panel ---------- */
  const panel = document.getElementById("panel");
  function renderPanel(n) {
    const lines = n.lines.map((lk) =>
      `<span class="chip"><i style="background:${LINES[lk].color}"></i>${LINES[lk].name}</span>`).join("");
    const facts = n.facts.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
    const routes = (n.routes && n.routes.length) ? n.routes : null;
    let routeHtml = "";
    if (routes) {
      const tabs = routes.length > 1
        ? `<div class="route-tabs">${routes.map((r, i) =>
            `<button data-r="${i}" class="${i === routeIdx ? "on" : ""}">${r.title}</button>`).join("")}</div>`
        : `<div class="route-title">${routes[0].title}</div>`;
      routeHtml = tabs + `<ol class="hops">${renderHops(routes[routeIdx])}</ol>
        <div class="ride"><button id="ridePrev" ${""}>&larr; prev hop</button>
        <button id="rideNext">next hop &rarr;</button></div>`;
    } else {
      routeHtml = `<div class="route-title">Sits on ${n.lines.map((l) => LINES[l].name).join(" + ")} — its whole line is lit on the map.</div>`;
    }
    panel.innerHTML = `
      <button id="panelClose" aria-label="close">&times;</button>
      <div class="p-kind">${KIND_LABEL[n.kind]}</div>
      <h2>${n.name}</h2>
      <div class="chips">${lines}</div>
      <p class="p-desc">${n.desc}</p>
      <table class="facts">${facts}</table>
      ${routeHtml}`;
    panel.classList.add("open");
    panel.scrollTop = 0;
    document.getElementById("panelClose").onclick = deselect;
    panel.querySelectorAll(".route-tabs button").forEach((b) => {
      b.onclick = () => {
        routeIdx = +b.dataset.r; rideStep = -1;
        clearActive();
        computeRouteActive(n, n.routes[routeIdx]);
        renderActive(); renderPanel(n);
      };
    });
    panel.querySelectorAll(".hops li").forEach((li) => {
      li.onclick = () => focusHop(n.routes[routeIdx].hops[+li.dataset.h]);
    });
    const rn = document.getElementById("rideNext"), rp = document.getElementById("ridePrev");
    if (rn) rn.onclick = () => ride(n, +1);
    if (rp) rp.onclick = () => ride(n, -1);
  }

  function renderHops(route) {
    return route.hops.map((h, i) => {
      const c = LINES[h.line].color;
      return `<li data-h="${i}"><span class="hop-head"><i style="background:${c}"></i><b>${nm(h.from)} &rarr; ${nm(h.to)}</b></span><span class="hop-label">${h.label}</span></li>`;
    }).join("");
  }
  function nm(id) { return nodeById[id] ? nodeById[id].name : id; }

  function focusHop(h) {
    const tr = traceLine(h.line, h.from, h.to);
    if (!tr) return;
    const pts = [];
    tr.legIdxs.forEach((li) => lineGeom[h.line].legs[li].points.forEach((p) => pts.push(p)));
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    panTo(mx, my, Math.max(view.k, 1.1));
  }

  function ride(n, dir) {
    const hops = n.routes[routeIdx].hops;
    rideStep = (rideStep + dir + hops.length + 1) % (hops.length + 1) - (dir > 0 ? 0 : 0);
    if (rideStep < 0 || rideStep >= hops.length) rideStep = dir > 0 ? 0 : hops.length - 1;
    focusHop(hops[rideStep]);
    panel.querySelectorAll(".hops li").forEach((li, i) => li.classList.toggle("riding", i === rideStep));
  }

  function closePanel() { panel.classList.remove("open"); }

  /* ---------- legend ---------- */
  const legend = document.getElementById("legendLines");
  const hiddenLines = new Set();
  Object.keys(LINES).forEach((lk) => {
    const L = LINES[lk];
    const div = document.createElement("div");
    div.className = "leg-line";
    div.innerHTML = `<i style="background:${L.color}"></i><div><b>${L.name}</b><span>${L.desc}</span></div>`;
    div.title = "click to show/hide this line";
    div.onclick = () => toggleLine(lk, div);
    legend.appendChild(div);
  });
  function toggleLine(lk, divEl) {
    if (hiddenLines.has(lk)) hiddenLines.delete(lk); else hiddenLines.add(lk);
    applyLineFilter();
  }
  function clearLineFilterSilently() {
    if (!hiddenLines.size) return;
    hiddenLines.clear();
    applyLineFilter();
  }
  function applyLineFilter() {
    document.querySelectorAll(".leg-line").forEach((d, i) => {
      d.classList.toggle("off", hiddenLines.has(Object.keys(LINES)[i]));
    });
    Object.keys(legEls).forEach((lk) => legEls[lk].forEach((p) =>
      p.classList.toggle("hidden-line", hiddenLines.has(lk))));
    NODES.forEach((n) => {
      const visible = n.lines.some((lk) => !hiddenLines.has(lk));
      stationEls[n.id].classList.toggle("hidden-line", !visible);
    });
    document.querySelectorAll("[data-line]").forEach((e) => {
      if (e.classList.contains("seg-label") || e.classList.contains("line-tag"))
        e.classList.toggle("hidden-line", hiddenLines.has(e.dataset.line));
    });
    if (selected) deselect();
  }
  document.getElementById("resetBtn").onclick = () => { clearLineFilterSilently(); deselect(); fitView(); };

  /* ---------- search ---------- */
  const search = document.getElementById("search");
  const results = document.getElementById("searchResults");
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { results.classList.remove("on"); return; }
    const hits = NODES.filter((n) => (n.name + " " + n.id + " " + n.kind).toLowerCase().includes(q)).slice(0, 8);
    results.innerHTML = hits.map((n) => `<div data-id="${n.id}">${n.name}<span>${KIND_LABEL[n.kind]}</span></div>`).join("");
    results.classList.add("on");
    results.querySelectorAll("div").forEach((d) => d.onclick = () => {
      results.classList.remove("on"); search.value = "";
      select(d.dataset.id, { zoomTo: 1.25 });
    });
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const f = results.querySelector("div"); if (f) f.onclick(); }
    if (e.key === "Escape") search.blur();
  });
  document.addEventListener("click", (e) => { if (!results.contains(e.target) && e.target !== search) results.classList.remove("on"); });

  /* ---------- pan / zoom ---------- */
  let view = { x: 0, y: 0, k: 1 };
  function applyView() {
    viewport.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.k})`);
  }
  function fitView() {
    const wrap = document.getElementById("mapwrap").getBoundingClientRect();
    if (wrap.width < 700) {
      // phones: fit-all is unreadably small — start on the Pi hub, pinch out
      const k = 0.55;
      view = { k, x: wrap.width / 2 - 850 * k, y: wrap.height / 2 - 600 * k };
    } else {
      const k = Math.min(wrap.width / (W + 40), wrap.height / (H + 40));
      view = { k, x: (wrap.width - W * k) / 2, y: (wrap.height - H * k) / 2 };
    }
    applyView();
  }
  function panTo(cx, cy, k) {
    const wrap = document.getElementById("mapwrap").getBoundingClientRect();
    view.k = k || view.k;
    view.x = wrap.width / 2 - cx * view.k;
    view.y = wrap.height / 2 - cy * view.k;
    applyView();
  }

  let didDrag = false;
  const pointers = new Map();
  let pinchD0 = 0, pinchK0 = 1;
  svg.addEventListener("pointerdown", (e) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    didDrag = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchD0 = Math.hypot(a.x - b.x, a.y - b.y);
      pinchK0 = view.k;
    }
  });
  svg.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) didDrag = true;
      view.x += dx; view.y += dy;
      applyView();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD0 > 0) {
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        zoomAt(cx, cy, pinchK0 * (d / pinchD0) / view.k);
      }
      didDrag = true;
    }
  });
  const endPointer = (e) => pointers.delete(e.pointerId);
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0016));
  }, { passive: false });

  function zoomAt(cx, cy, factor) {
    const r = svg.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    const k2 = Math.min(4, Math.max(0.25, view.k * factor));
    const f = k2 / view.k;
    view.x = px - (px - view.x) * f;
    view.y = py - (py - view.y) * f;
    view.k = k2;
    applyView();
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { deselect(); search.blur(); }
    if (e.key === "/" && document.activeElement !== search) { e.preventDefault(); search.focus(); }
  });

  /* ---------- boot ---------- */
  fitView();
  window.addEventListener("resize", fitView);
  const hash = location.hash.match(/#s=([\w-]+)/);
  if (hash && nodeById[hash[1]]) select(hash[1]);
})();
