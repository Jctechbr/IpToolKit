import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ipToBigint, bigintToIp, expand, compress, parseCidr,
  prefixToMask, networkAddress, lastAddress, firstHost, lastHost,
  totalAddresses, hostCount, normalize, subnetInfo,
} from "../public/js/lib/ipv6.js";

describe("bigintToIp / ipToBigint round-trip", () => {
  const cases = [
    "::1",
    "::",
    "2001:db8::1",
    "fe80::1",
    "ff02::1",
    "2001:db8:cafe:babe::1",
    "::ffff:192.0.2.1",
  ];
  for (const addr of cases) {
    it(`round-trips ${addr}`, () => {
      const n = ipToBigint(addr);
      const back = bigintToIp(n);
      // Check that re-parsing gives the same BigInt
      assert.equal(ipToBigint(back), n);
    });
  }
});

describe("expand", () => {
  it("expands ::1", () => {
    assert.equal(expand("::1"), "0000:0000:0000:0000:0000:0000:0000:0001");
  });
  it("expands ::", () => {
    assert.equal(expand("::"), "0000:0000:0000:0000:0000:0000:0000:0000");
  });
});

describe("compress", () => {
  it("compresses longest run of zeros", () => {
    assert.equal(compress("2001:0db8:0000:0000:0000:0000:0000:0001"), "2001:db8::1");
  });
  it("handles no zeros to compress", () => {
    const addr = "2001:db8:1:2:3:4:5:6";
    assert.equal(ipToBigint(compress(addr)), ipToBigint(addr));
  });
});

describe("prefixToMask", () => {
  it("/128 is all ones", () => {
    const m = prefixToMask(128);
    assert.equal(m, (1n << 128n) - 1n);
  });
  it("/0 is zero", () => {
    assert.equal(prefixToMask(0), 0n);
  });
  it("/64 has correct value", () => {
    const m = prefixToMask(64);
    assert.ok((m >> 64n) === (1n << 64n) - 1n);
    assert.ok((m & ((1n << 64n) - 1n)) === 0n);
  });
});

describe("network address", () => {
  it("zeros host bits for /48", () => {
    const net = networkAddress("2001:db8:1:2:3:4:5:6", 48);
    assert.equal(net, "2001:db8:1::");
  });
  it("handles ::/0", () => {
    assert.equal(networkAddress("::", 0), "::");
  });
  it("handles ::1/128", () => {
    assert.equal(networkAddress("::1", 128), "::1");
  });
});

describe("lastAddress", () => {
  it("/48 last address", () => {
    const last = lastAddress("2001:db8::", 48);
    assert.equal(last, "2001:db8:0:ffff:ffff:ffff:ffff:ffff");
  });
  it("::/0 last address", () => {
    assert.equal(lastAddress("::", 0), "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff");
  });
});

describe("hostCount / totalAddresses", () => {
  it("/128 = 1 address", () => {
    assert.equal(hostCount(128), 1n);
    assert.equal(totalAddresses(128), 1n);
  });
  it("/127 = 2 addresses (RFC6164)", () => {
    assert.equal(hostCount(127), 2n);
  });
  it("/64 large count", () => {
    const total = totalAddresses(64);
    assert.equal(total, 1n << 64n);
  });
});

describe("parseCidr", () => {
  it("parses with prefix", () => {
    const { ip, prefix } = parseCidr("2001:db8::/32");
    assert.equal(prefix, 32);
    assert.equal(ip, "2001:db8::");
  });
  it("bare address = /128", () => {
    assert.equal(parseCidr("::1").prefix, 128);
  });
});

describe("normalize", () => {
  it("zeros host bits", () => {
    assert.equal(normalize("2001:db8::1/32"), "2001:db8::/32");
  });
});

describe("subnetInfo", () => {
  it("returns full struct for /48", () => {
    const info = subnetInfo("2001:db8::/48");
    assert.equal(info.version, 6);
    assert.equal(info.prefix, 48);
    assert.ok(typeof info.hostCount === "bigint");
    assert.ok(info.expanded.includes(":"));
    assert.ok(info.compressed.includes("::") || info.compressed.includes(":"));
  });
});
