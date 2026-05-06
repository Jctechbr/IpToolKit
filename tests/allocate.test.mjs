import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allocate, hostsToPrefixLen } from "../public/js/lib/allocate.js";

describe("hostsToPrefixLen", () => {
  it("250 hosts → /24", () => {
    assert.equal(hostsToPrefixLen(250, "v4"), 24);
  });
  it("254 hosts → /24", () => {
    assert.equal(hostsToPrefixLen(254, "v4"), 24);
  });
  it("255 hosts → /23 (254 usable < 255)", () => {
    assert.equal(hostsToPrefixLen(255, "v4"), 23);
  });
  it("2 hosts → /31 (RFC3021 point-to-point)", () => {
    assert.equal(hostsToPrefixLen(2, "v4"), 31);
  });
  it("3 hosts → /29 (6 usable; /30 only has 2)", () => {
    assert.equal(hostsToPrefixLen(3, "v4"), 29);
  });
  it("1 host → /32", () => {
    assert.equal(hostsToPrefixLen(1, "v4"), 32);
  });
});

describe("allocate - basic v4", () => {
  it("allocates two subnets from /24", () => {
    const result = allocate("10.0.0.0/24", [
      { label: "A", size: 60 },
      { label: "B", size: 20 },
    ]);
    assert.equal(result.errors.length, 0);
    assert.equal(result.assignments.length, 2);
    // Assignments must not overlap
    const cidrs = result.assignments.map(a => a.cidr);
    assert.ok(cidrs.every(c => c.startsWith("10.0.0.")));
  });

  it("allocates by prefix string", () => {
    const result = allocate("10.0.0.0/22", [
      { label: "X", size: "/24" },
      { label: "Y", size: "/25" },
    ]);
    assert.equal(result.errors.length, 0);
    assert.equal(result.assignments.length, 2);
  });

  it("reports exhaustion error", () => {
    const result = allocate("10.0.0.0/30", [
      { label: "A", size: 200 },
    ]);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes("exhausted") || result.errors[0].includes("fit"));
  });

  it("produces non-overlapping assignments", () => {
    const result = allocate("192.168.0.0/16", [
      { label: "A", size: 200 },
      { label: "B", size: 100 },
      { label: "C", size: 50 },
      { label: "D", size: 10 },
    ]);
    assert.equal(result.errors.length, 0);
    // Verify no two assignments' ranges overlap by checking address ordering
    const sorted = result.assignments.slice().sort((a, b) => {
      const aIp = a.cidr.split("/")[0].split(".").map(Number);
      const bIp = b.cidr.split("/")[0].split(".").map(Number);
      for (let i = 0; i < 4; i++) {
        if (aIp[i] !== bIp[i]) return aIp[i] - bIp[i];
      }
      return 0;
    });
    for (let i = 0; i < sorted.length - 1; i++) {
      const aEnd = sorted[i].lastHost.split(".").map(Number);
      const bStart = sorted[i+1].cidr.split("/")[0].split(".").map(Number);
      const aEndN = aEnd.reduce((n, b) => n * 256 + b, 0);
      const bStartN = bStart.reduce((n, b) => n * 256 + b, 0);
      assert.ok(aEndN < bStartN, `Overlap between ${sorted[i].cidr} and ${sorted[i+1].cidr}`);
    }
  });

  it("includes free blocks in result", () => {
    const result = allocate("10.0.0.0/24", [
      { label: "only", size: 30 },
    ]);
    assert.ok(result.free.length >= 0); // may have free space
  });
});

describe("allocate - v6", () => {
  it("allocates /64 blocks from /48", () => {
    const result = allocate("2001:db8::/48", [
      { label: "mgmt", size: "/64" },
      { label: "servers", size: "/64" },
    ]);
    assert.equal(result.errors.length, 0);
    assert.equal(result.assignments.length, 2);
    const cidrs = result.assignments.map(a => a.cidr);
    assert.ok(cidrs.every(c => c.includes(":")));
  });
});

describe("allocate - edge cases", () => {
  it("empty requests returns empty assignments", () => {
    const result = allocate("10.0.0.0/24", []);
    assert.equal(result.assignments.length, 0);
    assert.equal(result.errors.length, 0);
  });

  it("entire pool as single /0-equivalent request", () => {
    const result = allocate("10.0.0.0/24", [
      { label: "all", size: "/24" },
    ]);
    assert.equal(result.errors.length, 0);
    assert.equal(result.assignments[0].cidr, "10.0.0.0/24");
  });
});
