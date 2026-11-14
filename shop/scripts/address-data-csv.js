#!/usr/bin/env node
// Builds a one-column CSV of apps-script/AddressData.gs's JSON for the
// sheet's hidden "AddressData" tab, an alternative to pasting the 63 KB
// AddressData.gs into the script editor. Each chunk starts with "x" so
// Sheets keeps it as plain text.
//
//   node scripts/address-data-csv.js > AddressData.csv
//   then in the sheet: File > Import > Upload, "Insert new sheet(s)",
//   untick "Convert text to numbers, dates, and formulas".
const fs = require("fs");
const path = require("path");

function chunks(size) {
  const src = fs.readFileSync(path.join(__dirname, "../apps-script/AddressData.gs"), "utf8");
  const json = src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1);
  JSON.parse(json); // must be valid
  const out = [];
  for (let i = 0; i < json.length; i += size) out.push("x" + json.slice(i, i + size));
  return out;
}

module.exports = { chunks };

if (require.main === module) {
  // Sheets cells hold 50,000 characters; stay well under.
  process.stdout.write(chunks(30000).map((c) => '"' + c.replace(/"/g, '""') + '"').join("\n") + "\n");
}
