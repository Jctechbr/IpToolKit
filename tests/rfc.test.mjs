import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyV4, classifyV6, classify } from "../public/js/lib/rfc.js";

describe("classifyV4", () => {
  it("RFC1918 - 10/8", () => {
    assert.ok(classifyV4("10.0.0.1").some(t => t.includes("RFC1918")));
  });
  it("RFC1918 - 172.16/12", () => {
    assert.ok(classifyV4("172.31.255.255").some(t => t.includes("RFC1918")));
  });
  it("RFC1918 - 192.168/16", () => {
    assert.ok(classifyV4("192.168.1.1").some(t => t.includes("RFC1918")));
  });
  it("CGNAT RFC6598", () => {
    assert.ok(classifyV4("100.64.0.1").some(t => t.includes("RFC6598") || t.includes("CGNAT")));
  });
  it("loopback", () => {
    assert.ok(classifyV4("127.0.0.1").some(t => t.includes("Loopback")));
  });
  it("link-local", () => {
    assert.ok(classifyV4("169.254.1.1").some(t => t.includes("Link-Local")));
  });
  it("multicast", () => {
    assert.ok(classifyV4("224.0.0.1").some(t => t.includes("Multicast")));
  });
  it("documentation TEST-NET-1", () => {
    assert.ok(classifyV4("192.0.2.1").some(t => t.includes("Documentation")));
  });
  it("documentation TEST-NET-2", () => {
    assert.ok(classifyV4("198.51.100.1").some(t => t.includes("Documentation")));
  });
  it("public address", () => {
    assert.ok(classifyV4("8.8.8.8").some(t => t.includes("Global Unicast") || t.includes("Public")));
  });
  it("broadcast", () => {
    assert.ok(classifyV4("255.255.255.255").some(t => t.includes("Broadcast") || t.includes("Reserved")));
  });
});

describe("classifyV6", () => {
  it("loopback ::1", () => {
    assert.ok(classifyV6("::1").some(t => t.includes("Loopback")));
  });
  it("unspecified ::", () => {
    assert.ok(classifyV6("::").some(t => t.includes("Unspecified")));
  });
  it("link-local", () => {
    assert.ok(classifyV6("fe80::1").some(t => t.includes("Link-Local")));
  });
  it("ULA fc00::/7", () => {
    assert.ok(classifyV6("fc00::1").some(t => t.includes("Unique Local") || t.includes("RFC4193")));
    assert.ok(classifyV6("fd00::1").some(t => t.includes("Unique Local") || t.includes("RFC4193")));
  });
  it("multicast ff00::/8", () => {
    assert.ok(classifyV6("ff02::1").some(t => t.includes("Multicast")));
  });
  it("documentation 2001:db8::/32", () => {
    assert.ok(classifyV6("2001:db8::1").some(t => t.includes("Documentation")));
  });
  it("NAT64 well-known 64:ff9b::/96", () => {
    assert.ok(classifyV6("64:ff9b::1").some(t => t.includes("NAT64") || t.includes("Translation")));
  });
  it("IPv4-mapped ::ffff:0:0/96", () => {
    assert.ok(classifyV6("::ffff:192.0.2.1").some(t => t.includes("IPv4-mapped") || t.includes("mapped")));
  });
  it("global unicast", () => {
    assert.ok(classifyV6("2001:4860:4860::8888").some(t => t.includes("Global Unicast") || t.includes("Teredo")));
  });
});

describe("classify (auto-detect)", () => {
  it("auto-detects v4", () => {
    assert.ok(classify("10.0.0.1").some(t => t.includes("RFC1918")));
  });
  it("auto-detects v6", () => {
    assert.ok(classify("::1").some(t => t.includes("Loopback")));
  });
});
