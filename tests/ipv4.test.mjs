import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ipToNum, numToIp, prefixToMask, maskToPrefix,
  parseCidr, networkAddress, broadcastAddress,
  firstHost, lastHost, hostCount, totalAddresses,
  wildcardMask, toHex, toBinary, normalize, subnetInfo,
} from "../public/js/lib/ipv4.js";

describe("numToIp / ipToNum round-trip", () => {
  it("converts common addresses", () => {
    assert.equal(numToIp(ipToNum("10.0.0.1")), "10.0.0.1");
    assert.equal(numToIp(ipToNum("192.168.1.255")), "192.168.1.255");
    assert.equal(numToIp(ipToNum("0.0.0.0")), "0.0.0.0");
    assert.equal(numToIp(ipToNum("255.255.255.255")), "255.255.255.255");
  });

  it("rejects bad input", () => {
    assert.throws(() => ipToNum("256.0.0.0"));
    assert.throws(() => ipToNum("1.2.3"));
    assert.throws(() => ipToNum("abc"));
  });
});

describe("prefixToMask / maskToPrefix", () => {
  it("handles standard masks", () => {
    assert.equal(numToIp(prefixToMask(24)), "255.255.255.0");
    assert.equal(numToIp(prefixToMask(16)), "255.255.0.0");
    assert.equal(numToIp(prefixToMask(0)),  "0.0.0.0");
    assert.equal(numToIp(prefixToMask(32)), "255.255.255.255");
    assert.equal(maskToPrefix(prefixToMask(24)), 24);
    assert.equal(maskToPrefix(prefixToMask(0)), 0);
    assert.equal(maskToPrefix(prefixToMask(32)), 32);
  });

  it("rejects non-contiguous masks", () => {
    assert.throws(() => maskToPrefix(ipToNum("255.0.255.0")));
  });
});

describe("parseCidr", () => {
  it("parses CIDR notation", () => {
    const r = parseCidr("10.0.0.0/24");
    assert.equal(r.prefix, 24);
    assert.equal(numToIp(r.ip), "10.0.0.0");
  });

  it("parses IP + netmask", () => {
    const r = parseCidr("10.0.0.0 255.255.255.0");
    assert.equal(r.prefix, 24);
  });

  it("parses IP + wildcard", () => {
    const r = parseCidr("10.0.0.0 0.0.0.255");
    assert.equal(r.prefix, 24);
  });

  it("parses bare host as /32", () => {
    assert.equal(parseCidr("1.2.3.4").prefix, 32);
  });
});

describe("subnet math", () => {
  it("handles /24", () => {
    const p = parseCidr("10.0.1.50/24");
    assert.equal(numToIp(networkAddress(p)), "10.0.1.0");
    assert.equal(numToIp(broadcastAddress(p)), "10.0.1.255");
    assert.equal(numToIp(firstHost(p)), "10.0.1.1");
    assert.equal(numToIp(lastHost(p)), "10.0.1.254");
    assert.equal(hostCount(p), 254);
    assert.equal(totalAddresses(p), 256);
  });

  it("handles /0 (all addresses)", () => {
    const p = parseCidr("0.0.0.0/0");
    assert.equal(numToIp(networkAddress(p)), "0.0.0.0");
    assert.equal(numToIp(broadcastAddress(p)), "255.255.255.255");
    assert.equal(hostCount(p), Math.pow(2, 32) - 2);
  });

  it("handles /32 (single host)", () => {
    const p = parseCidr("192.168.1.1/32");
    assert.equal(numToIp(networkAddress(p)), "192.168.1.1");
    assert.equal(numToIp(broadcastAddress(p)), "192.168.1.1");
    assert.equal(hostCount(p), 1);
    assert.equal(totalAddresses(p), 1);
  });

  it("handles /31 (point-to-point, RFC3021)", () => {
    const p = parseCidr("10.0.0.0/31");
    assert.equal(hostCount(p), 2);
    assert.equal(numToIp(firstHost(p)), "10.0.0.0");
    assert.equal(numToIp(lastHost(p)), "10.0.0.1");
  });

  it("handles /30", () => {
    const p = parseCidr("192.168.0.0/30");
    assert.equal(numToIp(broadcastAddress(p)), "192.168.0.3");
    assert.equal(hostCount(p), 2);
  });
});

describe("wildcardMask / hex / binary", () => {
  it("wildcard /24", () => {
    assert.equal(wildcardMask(24), "0.0.0.255");
  });
  it("wildcard /0", () => {
    assert.equal(wildcardMask(0), "255.255.255.255");
  });
  it("hex round-trip", () => {
    const n = ipToNum("10.0.0.0");
    assert.equal(toHex(n), "0x0a.0x00.0x00.0x00");
  });
  it("binary length", () => {
    assert.equal(toBinary(ipToNum("255.255.255.255")).replace(/\./g, "").length, 32);
  });
});

describe("normalize", () => {
  it("canonicalizes host bits", () => {
    assert.equal(normalize("10.0.0.5/24"), "10.0.0.0/24");
    assert.equal(normalize("192.168.1.100/16"), "192.168.0.0/16");
  });
});

describe("subnetInfo", () => {
  it("returns full info struct", () => {
    const info = subnetInfo("10.0.0.0/24");
    assert.equal(info.version, 4);
    assert.equal(info.networkAddress, "10.0.0.0");
    assert.equal(info.broadcastAddress, "10.0.0.255");
    assert.equal(info.hostCount, 254);
    assert.equal(info.netmask, "255.255.255.0");
    assert.equal(info.wildcardMask, "0.0.0.255");
  });
});
