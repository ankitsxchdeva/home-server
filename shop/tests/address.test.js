// node --test shop/tests
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const data = require(path.join(__dirname, "../site/address-data.json"));
const rules = require(path.join(__dirname, "../site/address.js")).create(data);

const ok = (cc, v) => rules.validate(cc, v).errors;

test("US: valid Austin address passes", () => {
  assert.deepStrictEqual(ok("US", { address1: "1100 S Lamar Blvd", city: "Austin", region: "TX", postal: "78704" }), {});
  assert.deepStrictEqual(ok("US", { address1: "1100 S Lamar Blvd", city: "Austin", region: "TX", postal: "78704-1234" }), {});
});
test("US: missing state and bad ZIP are caught", () => {
  const e = ok("US", { address1: "1 Main St", city: "Austin", region: "", postal: "7870" });
  assert.ok(e.region); assert.ok(e.postal);
});
test("US: ZIP from another state is caught", () => {
  const e = ok("US", { address1: "1 Main St", city: "Austin", region: "TX", postal: "10001" });
  assert.match(e.postal, /Texas/);
});
test("Canada: postal code with or without space", () => {
  assert.deepStrictEqual(ok("CA", { address1: "100 Queen St W", city: "Toronto", region: "ON", postal: "m5h 2n2" }), {});
  assert.ok(ok("CA", { address1: "100 Queen St W", city: "Toronto", region: "ON", postal: "12345" }).postal);
});
test("UK: no county field, postcode checked", () => {
  const fields = rules.layout("GB").flat().map((f) => f.key);
  assert.ok(!fields.includes("region"));
  assert.deepStrictEqual(ok("GB", { address1: "10 Downing St", city: "London", postal: "SW1A 2AA" }), {});
  assert.ok(ok("GB", { address1: "10 Downing St", city: "London", postal: "ABC" }).postal);
});
test("Japan: prefecture list uses latin names, accepts key or name", () => {
  const region = rules.layout("JP").flat().find((f) => f.key === "region");
  assert.ok(region.options.some((o) => o.label === "Tokyo"));
  const r = rules.validate("JP", { address1: "1-1 Chiyoda", city: "Chiyoda-ku", region: "Tokyo", postal: "100-0001" });
  assert.deepStrictEqual(r.errors, {});
  assert.strictEqual(r.address.regionName, "Tokyo");
});
test("India: PIN code label and check", () => {
  const z = rules.layout("IN").flat().find((f) => f.key === "postal");
  assert.strictEqual(z.label, "PIN code");
  assert.ok(ok("IN", { address1: "12 MG Road", city: "Bengaluru", region: "Karnataka", postal: "5600" }).postal);
});
test("Germany: postal before city, no state", () => {
  assert.deepStrictEqual(ok("DE", { address1: "Unter den Linden 1", city: "Berlin", postal: "10117" }), {});
});
test("Unknown country is rejected", () => {
  assert.ok(ok("XX", {}).country);
});
test("Fields the country doesn't use are dropped", () => {
  const r = rules.validate("GB", { address1: "10 Downing St", city: "London", postal: "SW1A 2AA", region: "TX" });
  assert.strictEqual(r.address.region, "");
});
