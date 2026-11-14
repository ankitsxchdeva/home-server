// Minimal in-memory stand-ins for the Apps Script services the backend uses.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function makeSheet(name) {
  const cells = []; // rows of arrays
  const sheet = {
    name, cells, notes: {}, hidden: [],
    getName: () => name,
    getLastRow: () => { for (let r = cells.length; r > 0; r--) if ((cells[r - 1] || []).some((v) => v !== "" && v != null)) return r; return 0; },
    getLastColumn: () => cells.reduce((m, r) => { let c = 0; (r || []).forEach((v, i) => { if (v !== "" && v != null) c = i + 1; }); return Math.max(m, c); }, 0),
    getMaxRows: () => 1000,
    getRange(a, b, nr, nc) {
      if (typeof a === "string") { // A1-ish, only used for formatting
        return range(1, 2, 1, 1);
      }
      return range(a, b, nr || 1, nc || 1);
    },
    getDataRange() { return range(1, 1, Math.max(1, sheet.getLastRow()), Math.max(1, sheet.getLastColumn())); },
    appendRow(vals) { const r = sheet.getLastRow() + 1; range(r, 1, 1, vals.length).setValues([vals]); },
    setFrozenRows() {}, setColumnWidth() {}, hideColumns(c) { sheet.hidden.push(c); }, clear() { cells.length = 0; },
    getActiveRangeList: () => null,
    getActiveRange: () => sheet._active,
  };
  function range(r0, c0, nr, nc) {
    const rg = {
      getRow: () => r0, getNumRows: () => nr, getColumn: () => c0, getLastColumn: () => c0 + nc - 1, getLastRow: () => r0 + nr - 1,
      getSheet: () => sheet,
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (cells[r0 - 1 + i] || [])[c0 - 1 + j]; row.push(v == null ? "" : v); } out.push(row); }
        return out;
      },
      getValue() { return rg.getValues()[0][0]; },
      setValues(vals) {
        vals.forEach((row, i) => row.forEach((v, j) => { const ri = r0 - 1 + i; cells[ri] = cells[ri] || []; cells[ri][c0 - 1 + j] = v; }));
        return rg;
      },
      setValue(v) { return rg.setValues([[v]]); },
      setFormula(f) { return rg.setValue(f); },
      setNumberFormat() { return rg; }, setDataValidation() { return rg; }, setFontWeight() { return rg; },
      setBackground() { return rg; }, setNote(n) { sheet.notes[`${r0},${c0}`] = n; return rg; }, setWrap() { return rg; },
    };
    return rg;
  }
  return sheet;
}

function load(opts = {}) {
  const sheets = [];
  const sent = [], drafts = [], alerts = [];
  let lockHeld = false;
  const ss = {
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet: (n) => { const s = makeSheet(n); sheets.push(s); return s; },
    setActiveSheet: (s) => { ss._active = s; },
    getActiveSheet: () => ss._active,
    getSpreadsheetTimeZone: () => "America/Chicago",
  };
  const ui = {
    alert: (...a) => { alerts.push(a); return opts.answer || "YES"; },
    ButtonSet: { YES_NO: "YES_NO" }, Button: { YES: "YES", NO: "NO" },
    createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }),
  };
  const ctx = {
    console,
    SpreadsheetApp: {
      getActive: () => ss, getUi: () => ui, flush() {},
      newDataValidation: () => ({ requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } }),
      getActiveSheet: () => ss._active,
    },
    LockService: { getScriptLock: () => ({
      tryLock: () => { if (lockHeld || opts.lockFails) return false; lockHeld = true; return true; },
      releaseLock: () => { lockHeld = false; },
    }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 16).replace("T", " ") },
    Session: { getEffectiveUser: () => ({ getEmail: () => "owner@example.com" }) },
    GmailApp: {
      sendEmail: (to, subject, body, o) => sent.push({ to, subject, body }),
      createDraft: (to, subject, body, o) => drafts.push({ to, subject, body }),
    },
  };
  vm.createContext(ctx);
  for (const f of ["AddressData.gs", "Code.gs", "Admin.gs"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../apps-script", f), "utf8"), ctx, { filename: f });
  }
  return { ctx, ss, sheets, sent, drafts, alerts };
}

module.exports = { load };
