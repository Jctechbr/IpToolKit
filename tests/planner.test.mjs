import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePlannerRequests } from "../public/js/tools/planner.js";
import { allocate } from "../public/js/lib/allocate.js";

describe("parsePlannerRequests — valid host-count format", () => {
  it("parses a single name+hosts line", () => {
    const result = parsePlannerRequests("Servers 50");
    assert.deepEqual(result, [{ label: "Servers", size: 50 }]);
  });

  it("parses multiple name+hosts lines", () => {
    const result = parsePlannerRequests("A 10\nB 200\nC 1");
    assert.equal(result.length, 3);
    assert.equal(result[0].label, "A");
    assert.equal(result[0].size, 10);
    assert.equal(result[1].label, "B");
    assert.equal(result[1].size, 200);
    assert.equal(result[2].label, "C");
    assert.equal(result[2].size, 1);
  });
});

describe("parsePlannerRequests — valid prefix format", () => {
  it("parses a /prefix line", () => {
    const result = parsePlannerRequests("Management /28");
    assert.deepEqual(result, [{ label: "Management", size: "/28" }]);
  });

  it("parses /30 prefix", () => {
    const result = parsePlannerRequests("P2P /30");
    assert.deepEqual(result, [{ label: "P2P", size: "/30" }]);
  });

  it("parses /64 IPv6-style prefix length", () => {
    const result = parsePlannerRequests("Core /64");
    assert.deepEqual(result, [{ label: "Core", size: "/64" }]);
  });
});

describe("parsePlannerRequests — mixed and blank lines", () => {
  it("parses mixed host-count and prefix lines", () => {
    const result = parsePlannerRequests("Servers 50\nMgmt /28\nDMZ 14");
    assert.equal(result.length, 3);
    assert.equal(result[0].size, 50);
    assert.equal(result[1].size, "/28");
    assert.equal(result[2].size, 14);
  });

  it("skips blank lines", () => {
    const result = parsePlannerRequests("\nServers 50\n\nMgmt /28\n");
    assert.equal(result.length, 2);
  });

  it("returns empty array for all-blank input", () => {
    assert.deepEqual(parsePlannerRequests("   \n\n  "), []);
  });

  it("returns empty array for empty string", () => {
    assert.deepEqual(parsePlannerRequests(""), []);
  });
});

describe("parsePlannerRequests — invalid lines throw", () => {
  it("throws when size is missing (no whitespace)", () => {
    assert.throws(
      () => parsePlannerRequests("ServerOnly"),
      /missing size|Invalid/
    );
  });

  it("throws when host count is zero", () => {
    assert.throws(
      () => parsePlannerRequests("BadNet 0"),
      /Invalid/
    );
  });

  it("throws when host count is negative", () => {
    assert.throws(
      () => parsePlannerRequests("BadNet -5"),
      /Invalid/
    );
  });

  it("throws when host count is not an integer", () => {
    assert.throws(
      () => parsePlannerRequests("BadNet 12.5"),
      /Invalid/
    );
  });

  it("throws when prefix length is out of range", () => {
    assert.throws(
      () => parsePlannerRequests("BadNet /200"),
      /Invalid/
    );
  });

  it("throws when prefix has non-numeric length", () => {
    assert.throws(
      () => parsePlannerRequests("BadNet /abc"),
      /Invalid/
    );
  });
});

describe("allocate integration — simple plan", () => {
  it("allocates a plan from parsePlannerRequests output", () => {
    const requests = parsePlannerRequests("Servers 50\nMgmt /28\nP2P /30");
    const { assignments, errors } = allocate("10.0.0.0/24", requests);
    assert.equal(errors.length, 0);
    assert.equal(assignments.length, 3);
    const labels = assignments.map((a) => a.label);
    assert.ok(labels.includes("Servers"));
    assert.ok(labels.includes("Mgmt"));
    assert.ok(labels.includes("P2P"));
  });

  it("allocations are within the pool range", () => {
    const requests = parsePlannerRequests("A 20\nB 10");
    const { assignments, errors } = allocate("192.168.1.0/24", requests);
    assert.equal(errors.length, 0);
    for (const a of assignments) {
      assert.ok(
        a.cidr.startsWith("192.168.1."),
        `${a.cidr} not in pool`
      );
    }
  });

  it("reports error when pool is exhausted", () => {
    const requests = parsePlannerRequests("A 500");
    const { errors } = allocate("10.0.0.0/30", requests);
    assert.ok(errors.length > 0);
    assert.ok(errors[0].toLowerCase().includes("exhaust") || errors[0].toLowerCase().includes("fit"));
  });

  it("correctly allocates prefix-based requests", () => {
    const requests = parsePlannerRequests("Core /25\nEdge /26");
    const { assignments, errors } = allocate("10.10.0.0/22", requests);
    assert.equal(errors.length, 0);
    const coreCidr = assignments.find((a) => a.label === "Core");
    const edgeCidr = assignments.find((a) => a.label === "Edge");
    assert.ok(coreCidr, "Core assignment missing");
    assert.ok(edgeCidr, "Edge assignment missing");
    assert.equal(coreCidr.prefixLen, 25);
    assert.equal(edgeCidr.prefixLen, 26);
  });
});
