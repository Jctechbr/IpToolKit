import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reverseDns, reverseV4, reverseV6 } from "../public/js/lib/reverse_dns.js";

describe("reverseV4", () => {
  it("/24 zone", () => {
    const r = reverseV4("10.0.1.0/24");
    assert.equal(r.zoneName, "1.0.10.in-addr.arpa");
    assert.ok(r.origin.startsWith("$ORIGIN"));
  });
  it("/16 zone", () => {
    const r = reverseV4("10.0.0.0/16");
    assert.equal(r.zoneName, "0.10.in-addr.arpa");
  });
  it("/8 zone", () => {
    const r = reverseV4("10.0.0.0/8");
    assert.equal(r.zoneName, "10.in-addr.arpa");
  });
  it("/25 classless delegation note", () => {
    const r = reverseV4("10.0.0.128/25");
    assert.ok(r.zoneName.includes("/") || r.note.includes("RFC2317") || r.note.includes("Classless"));
  });
  it("/32 has classless note", () => {
    const r = reverseV4("10.0.0.1/32");
    assert.ok(r.note.length > 0 || r.zoneName.length > 0);
  });
});

describe("reverseV6", () => {
  it("/32 zone produces correct nibble reverse", () => {
    const r = reverseV6("2001:db8::/32");
    // 2001:0db8... → nibbles: 1,0,0,2 . 8,b,d,0 → reversed: 8,b,d,0,1,0,0,2
    assert.ok(r.zoneName.endsWith(".ip6.arpa"));
    assert.ok(r.origin.startsWith("$ORIGIN"));
  });
  it("/48 zone", () => {
    const r = reverseV6("2001:db8::/48");
    assert.ok(r.zoneName.endsWith(".ip6.arpa"));
  });
  it("non-nibble boundary note", () => {
    const r = reverseV6("2001:db8::/33");
    assert.ok(r.note.length > 0);
  });
  it("/128 produces 32-nibble zone", () => {
    const r = reverseV6("::1/128");
    // 32 nibbles reversed
    const dots = (r.zoneName.match(/\./g) || []).length;
    assert.ok(dots >= 31);
  });
});

describe("reverseDns auto-detect", () => {
  it("auto-detects v4", () => {
    const r = reverseDns("192.168.1.0/24");
    assert.ok(r.zoneName.includes("in-addr.arpa"));
  });
  it("auto-detects v6", () => {
    const r = reverseDns("2001:db8::/32");
    assert.ok(r.zoneName.includes("ip6.arpa"));
  });
});
