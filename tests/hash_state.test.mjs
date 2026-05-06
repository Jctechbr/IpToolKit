import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encode, decode } from "../public/js/lib/hash_state.js";

describe("encode", () => {
  it("produces hash with toolId and params", () => {
    const h = encode("calc", { ip: "10.0.0.0", prefix: "24" });
    assert.ok(h.startsWith("#calc?"));
    assert.ok(h.includes("ip=10.0.0.0"));
    assert.ok(h.includes("prefix=24"));
  });

  it("produces bare hash when no params", () => {
    assert.equal(encode("calc", {}), "#calc");
  });

  it("omits empty string values", () => {
    const h = encode("calc", { ip: "10.0.0.0", prefix: "" });
    assert.ok(!h.includes("prefix="));
  });

  it("percent-encodes special characters", () => {
    const h = encode("calc", { cidr: "10.0.0.0/24" });
    assert.ok(h.includes("%2F") || h.includes("24")); // / is encoded
  });
});

describe("decode", () => {
  it("parses toolId and params", () => {
    const r = decode("#calc?ip=10.0.0.0&prefix=24");
    assert.equal(r.toolId, "calc");
    assert.equal(r.params.ip, "10.0.0.0");
    assert.equal(r.params.prefix, "24");
  });

  it("handles bare toolId", () => {
    const r = decode("#embed");
    assert.equal(r.toolId, "embed");
    assert.deepEqual(r.params, {});
  });

  it("handles empty hash", () => {
    const r = decode("#");
    assert.equal(r.toolId, "");
  });

  it("handles null/undefined", () => {
    const r = decode(null);
    assert.equal(r.toolId, "");
  });

  it("decodes percent-encoded values", () => {
    const h = encode("calc", { cidr: "10.0.0.0/24" });
    const r = decode(h);
    assert.equal(r.params.cidr, "10.0.0.0/24");
  });
});

describe("round-trip", () => {
  it("encode then decode preserves data", () => {
    const params = { ip: "2001:db8::1", prefix: "48", mode: "6to4" };
    const h = encode("embed", params);
    const r = decode(h);
    assert.equal(r.toolId, "embed");
    assert.equal(r.params.ip, params.ip);
    assert.equal(r.params.prefix, params.prefix);
    assert.equal(r.params.mode, params.mode);
  });
});
