/**
 * Unit tests for lib/routes.js — parseTable and longestMatch.
 *
 * Run with: node --test tests/routes.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseTable, longestMatch } from "../public/js/lib/routes.js";

// ---------------------------------------------------------------------------
// parseTable
// ---------------------------------------------------------------------------

describe("parseTable", () => {
  it("parses 'via' format lines", () => {
    const result = parseTable("10.0.0.0/8 via 192.168.1.1");
    assert.equal(result.length, 1);
    assert.equal(result[0].prefix, "10.0.0.0/8");
    assert.equal(result[0].nexthop, "192.168.1.1");
  });

  it("parses space-separated format lines (no 'via')", () => {
    const result = parseTable("10.0.0.0/8 192.168.1.1");
    assert.equal(result.length, 1);
    assert.equal(result[0].prefix, "10.0.0.0/8");
    assert.equal(result[0].nexthop, "192.168.1.1");
  });

  it("skips blank lines", () => {
    const text = `
10.0.0.0/8 via 192.168.1.1

172.16.0.0/12 via 10.0.0.1

`;
    const result = parseTable(text);
    assert.equal(result.length, 2);
  });

  it("skips comment lines (# prefix)", () => {
    const text = `# This is a comment
10.0.0.0/8 via 192.168.1.1
# Another comment
172.16.0.0/12 via 10.0.0.1`;
    const result = parseTable(text);
    assert.equal(result.length, 2);
  });

  it("parses multiple routes in order", () => {
    const text = `0.0.0.0/0 via 203.0.113.1
10.0.0.0/8 via 10.255.255.1
192.168.1.0/24 via 192.168.1.254`;
    const result = parseTable(text);
    assert.equal(result.length, 3);
    assert.equal(result[0].prefix, "0.0.0.0/0");
    assert.equal(result[1].prefix, "10.0.0.0/8");
    assert.equal(result[2].prefix, "192.168.1.0/24");
  });

  it("canonicalises the network address (host bits zeroed)", () => {
    // 10.1.2.3/8 → network is 10.0.0.0/8
    const result = parseTable("10.1.2.3/8 via 192.168.1.1");
    assert.equal(result[0].prefix, "10.0.0.0/8");
  });

  it("parses the default route 0.0.0.0/0", () => {
    const result = parseTable("0.0.0.0/0 via 203.0.113.1");
    assert.equal(result.length, 1);
    assert.equal(result[0].prefix, "0.0.0.0/0");
    assert.equal(result[0].nexthop, "203.0.113.1");
  });

  it("parses /32 host routes", () => {
    const result = parseTable("192.0.2.1/32 via 198.51.100.1");
    assert.equal(result[0].prefix, "192.0.2.1/32");
  });

  it("throws on a malformed line (missing nexthop)", () => {
    assert.throws(
      () => parseTable("10.0.0.0/8"),
      /cannot parse routing entry/i
    );
  });

  it("throws on a line with an invalid IP in the prefix", () => {
    assert.throws(
      () => parseTable("999.0.0.0/8 via 10.0.0.1"),
      /Invalid/i
    );
  });

  it("handles mixed comment, blank, and valid lines together", () => {
    const text = `
# Full routing table
# Generated 2026-05-06

0.0.0.0/0 via 203.0.113.1
10.0.0.0/8 10.255.255.1

# Private ranges
172.16.0.0/12 via 172.31.255.1
`;
    const result = parseTable(text);
    assert.equal(result.length, 3);
    assert.equal(result[0].nexthop, "203.0.113.1");
    assert.equal(result[1].nexthop, "10.255.255.1");
    assert.equal(result[2].nexthop, "172.31.255.1");
  });
});

// ---------------------------------------------------------------------------
// longestMatch
// ---------------------------------------------------------------------------

describe("longestMatch", () => {
  /** Convenience: build a table from an array of [prefix, nexthop] pairs. */
  function makeTable(pairs) {
    return pairs.map(([prefix, nexthop]) => ({ prefix, nexthop }));
  }

  it("returns winner=null when table is empty", () => {
    const result = longestMatch([], "10.1.2.3");
    assert.equal(result.winner, null);
    assert.deepEqual(result.matches, []);
  });

  it("returns winner=null when no route covers the destination", () => {
    const table = makeTable([["192.168.1.0/24", "192.168.1.1"]]);
    const result = longestMatch(table, "10.0.0.1");
    assert.equal(result.winner, null);
    assert.equal(result.matches.length, 0);
  });

  it("finds an exact single match", () => {
    const table = makeTable([["10.10.20.0/24", "10.10.20.1"]]);
    const result = longestMatch(table, "10.10.20.55");
    assert.equal(result.winner.prefix, "10.10.20.0/24");
    assert.equal(result.winner.nexthop, "10.10.20.1");
    assert.equal(result.matches.length, 1);
  });

  it("picks the most-specific (longest prefix) as winner", () => {
    const table = makeTable([
      ["10.0.0.0/8", "10.255.255.1"],
      ["10.10.0.0/16", "10.10.255.1"],
      ["10.10.20.0/24", "10.10.20.1"],
    ]);
    const result = longestMatch(table, "10.10.20.55");
    assert.equal(result.winner.prefix, "10.10.20.0/24");
    assert.equal(result.winner.prefixLen, 24);
    assert.equal(result.matches.length, 3);
  });

  it("sorts matches by prefix length descending", () => {
    const table = makeTable([
      ["10.0.0.0/8", "10.255.255.1"],
      ["10.10.0.0/16", "10.10.255.1"],
      ["10.10.20.0/24", "10.10.20.1"],
    ]);
    const { matches } = longestMatch(table, "10.10.20.55");
    assert.equal(matches[0].prefixLen, 24);
    assert.equal(matches[1].prefixLen, 16);
    assert.equal(matches[2].prefixLen, 8);
  });

  it("falls back to default route 0.0.0.0/0 when no specific match", () => {
    const table = makeTable([
      ["0.0.0.0/0", "203.0.113.1"],
      ["192.168.1.0/24", "192.168.1.254"],
    ]);
    const result = longestMatch(table, "8.8.8.8");
    assert.equal(result.winner.prefix, "0.0.0.0/0");
    assert.equal(result.winner.nexthop, "203.0.113.1");
    assert.equal(result.matches.length, 1);
  });

  it("default route matches any address alongside more-specific routes", () => {
    const table = makeTable([
      ["0.0.0.0/0", "203.0.113.1"],
      ["10.0.0.0/8", "10.255.255.1"],
    ]);
    const result = longestMatch(table, "10.5.6.7");
    // Winner is /8, not /0
    assert.equal(result.winner.prefix, "10.0.0.0/8");
    assert.equal(result.matches.length, 2);
  });

  it("returns prefixLen on each match entry", () => {
    const table = makeTable([["172.16.0.0/12", "172.31.0.1"]]);
    const result = longestMatch(table, "172.20.0.1");
    assert.equal(result.winner.prefixLen, 12);
  });

  it("does not match a route outside the destination network", () => {
    const table = makeTable([
      ["10.0.0.0/8", "10.255.255.1"],
      ["192.168.0.0/16", "192.168.255.1"],
    ]);
    const result = longestMatch(table, "172.16.5.5");
    assert.equal(result.winner, null);
    assert.equal(result.matches.length, 0);
  });

  it("handles multiple routes all matching (supernets stacked)", () => {
    const table = makeTable([
      ["0.0.0.0/0", "1.1.1.1"],
      ["10.0.0.0/8", "2.2.2.2"],
      ["10.10.0.0/16", "3.3.3.3"],
      ["10.10.20.0/24", "4.4.4.4"],
    ]);
    const { winner, matches } = longestMatch(table, "10.10.20.1");
    assert.equal(matches.length, 4);
    assert.equal(winner.nexthop, "4.4.4.4");
  });

  it("throws when destIp is not a valid IPv4 address", () => {
    const table = makeTable([["10.0.0.0/8", "10.0.0.1"]]);
    assert.throws(
      () => longestMatch(table, "not-an-ip"),
      /Invalid/i
    );
  });

  it("matches a /32 host route exactly", () => {
    const table = makeTable([
      ["10.0.0.0/8", "10.255.255.1"],
      ["10.1.2.3/32", "10.1.2.254"],
    ]);
    const result = longestMatch(table, "10.1.2.3");
    assert.equal(result.winner.prefix, "10.1.2.3/32");
    assert.equal(result.winner.prefixLen, 32);
  });

  it("does not match /32 host route for a different host", () => {
    const table = makeTable([["10.1.2.3/32", "10.1.2.254"]]);
    const result = longestMatch(table, "10.1.2.4");
    assert.equal(result.winner, null);
  });
});
