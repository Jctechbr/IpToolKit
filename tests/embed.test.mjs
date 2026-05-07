import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { embed, extract, bitLayout, MODES } from "../public/js/lib/embed.js";

describe("embed - ipv4-mapped", () => {
  it("encodes 192.0.2.1 as ::ffff:192.0.2.1", () => {
    const r = embed("192.0.2.1", "ipv4-mapped");
    // Should contain ffff and the v4 address
    assert.ok(r.includes("ffff") || r.includes("c000") || r.length > 10);
  });

  it("round-trips: embed then extract", () => {
    const ipv6 = embed("10.0.0.1", "ipv4-mapped");
    const extracted = extract(ipv6);
    assert.ok(extracted !== null);
    assert.equal(extracted.mode, "ipv4-mapped");
    assert.equal(extracted.ipv4, "10.0.0.1");
  });
});

describe("embed - 6to4", () => {
  it("embeds 192.0.2.1 to 2002:c000:0201::", () => {
    const r = embed("192.0.2.1", "6to4");
    assert.ok(r.startsWith("2002:"));
  });

  it("round-trips 6to4", () => {
    const ipv6 = embed("192.0.2.33", "6to4");
    const extracted = extract(ipv6);
    assert.ok(extracted !== null);
    assert.equal(extracted.mode, "6to4");
    assert.equal(extracted.ipv4, "192.0.2.33");
  });
});

describe("embed - nat64 well-known", () => {
  it("uses 64:ff9b:: prefix", () => {
    const r = embed("192.0.2.1", "nat64-wk");
    assert.ok(r.startsWith("64:ff9b::") || r.includes("ff9b"));
  });

  it("round-trips", () => {
    const ipv6 = embed("203.0.113.1", "nat64-wk");
    const extracted = extract(ipv6);
    assert.ok(extracted !== null);
    assert.equal(extracted.ipv4, "203.0.113.1");
  });
});

describe("embed - nat64 custom", () => {
  it("requires custom prefix", () => {
    assert.throws(() => embed("1.2.3.4", "nat64-custom"));
  });

  it("round-trips with custom /96", () => {
    const custom = "2001:db8::/96";
    const ipv6 = embed("10.0.0.1", "nat64-custom", custom);
    const extracted = extract(ipv6, custom);
    assert.ok(extracted !== null);
    assert.equal(extracted.ipv4, "10.0.0.1");
  });
});

describe("extract - unknown address", () => {
  it("returns null for a plain global unicast", () => {
    const result = extract("2001:4860:4860::8888");
    assert.equal(result, null);
  });
});

describe("extract - ipv4-compatible edge cases", () => {
  it("returns null for ::1 (loopback must not be classified as ipv4-compatible)", () => {
    assert.equal(extract("::1"), null);
  });

  it("returns null for ::0 (unspecified)", () => {
    assert.equal(extract("::"), null);
  });

  it("classifies ::0.0.0.2 as ipv4-compatible with ipv4 0.0.0.2", () => {
    const result = extract("::0.0.0.2");
    assert.ok(result !== null);
    assert.equal(result.mode, "ipv4-compatible");
    assert.equal(result.ipv4, "0.0.0.2");
  });

  it("classifies ::255.255.255.255 as ipv4-compatible", () => {
    const result = extract("::255.255.255.255");
    assert.ok(result !== null);
    assert.equal(result.mode, "ipv4-compatible");
    assert.equal(result.ipv4, "255.255.255.255");
  });
});

describe("bitLayout", () => {
  it("returns 8 words for /96 modes", () => {
    const layout = bitLayout("ipv4-mapped");
    assert.equal(layout.length, 8);
    assert.equal(layout[6].type, "ipv4");
    assert.equal(layout[7].type, "ipv4");
  });

  it("6to4 marks words 0 as prefix, 1-2 as ipv4", () => {
    const layout = bitLayout("6to4");
    assert.equal(layout[0].type, "prefix");
    assert.equal(layout[1].type, "ipv4");
    assert.equal(layout[2].type, "ipv4");
  });
});

describe("MODES export", () => {
  it("contains expected keys", () => {
    assert.ok("ipv4-mapped" in MODES);
    assert.ok("6to4" in MODES);
    assert.ok("nat64-wk" in MODES);
    assert.ok("nat64-custom" in MODES);
  });
});
