import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalize, dedupe, sort } from "../public/js/lib/prefix.js";

/**
 * Inline copy of diffPrefixes — tests must not import DOM-dependent tool modules.
 * The logic is identical to tools/diffs.js#diffPrefixes.
 */
function diffPrefixes(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);

  const onlyA = sort(a.filter((c) => !setB.has(c)));
  const onlyB = sort(b.filter((c) => !setA.has(c)));
  const both  = sort(a.filter((c) => setB.has(c)));

  return { onlyA, onlyB, both };
}

describe("diffPrefixes — basic set difference", () => {
  it("identifies prefix only in A", () => {
    const a = ["10.0.0.0/24", "10.0.1.0/24"];
    const b = ["10.0.1.0/24"];
    const { onlyA, onlyB, both } = diffPrefixes(a, b);
    assert.deepEqual(onlyA, ["10.0.0.0/24"]);
    assert.deepEqual(onlyB, []);
    assert.deepEqual(both,  ["10.0.1.0/24"]);
  });

  it("identifies prefix only in B", () => {
    const a = ["10.0.0.0/24"];
    const b = ["10.0.0.0/24", "192.168.0.0/16"];
    const { onlyA, onlyB, both } = diffPrefixes(a, b);
    assert.deepEqual(onlyA, []);
    assert.deepEqual(onlyB, ["192.168.0.0/16"]);
    assert.deepEqual(both,  ["10.0.0.0/24"]);
  });

  it("handles fully disjoint lists", () => {
    const a = ["10.0.0.0/8"];
    const b = ["172.16.0.0/12"];
    const { onlyA, onlyB, both } = diffPrefixes(a, b);
    assert.deepEqual(onlyA, ["10.0.0.0/8"]);
    assert.deepEqual(onlyB, ["172.16.0.0/12"]);
    assert.deepEqual(both,  []);
  });

  it("handles fully identical lists", () => {
    const a = ["10.0.0.0/24", "192.168.1.0/24"];
    const b = ["10.0.0.0/24", "192.168.1.0/24"];
    const { onlyA, onlyB, both } = diffPrefixes(a, b);
    assert.deepEqual(onlyA, []);
    assert.deepEqual(onlyB, []);
    assert.equal(both.length, 2);
  });

  it("handles empty lists", () => {
    const { onlyA, onlyB, both } = diffPrefixes([], []);
    assert.deepEqual(onlyA, []);
    assert.deepEqual(onlyB, []);
    assert.deepEqual(both,  []);
  });

  it("handles one empty list", () => {
    const a = ["10.0.0.0/24"];
    const { onlyA, onlyB, both } = diffPrefixes(a, []);
    assert.deepEqual(onlyA, ["10.0.0.0/24"]);
    assert.deepEqual(onlyB, []);
    assert.deepEqual(both,  []);
  });
});

describe("diffPrefixes — IPv6 support", () => {
  it("diffs v6 prefixes", () => {
    const a = ["2001:db8::/32", "fd00::/8"];
    const b = ["2001:db8::/32"];
    const { onlyA, onlyB, both } = diffPrefixes(a, b);
    assert.deepEqual(onlyA, ["fd00::/8"]);
    assert.deepEqual(onlyB, []);
    assert.deepEqual(both,  ["2001:db8::/32"]);
  });

  it("mixed v4 and v6 lists", () => {
    const a = ["10.0.0.0/8", "2001:db8::/32"];
    const b = ["10.0.0.0/8", "fd00::/8"];
    const { onlyA, onlyB, both } = diffPrefixes(a, b);
    assert.deepEqual(onlyA, ["2001:db8::/32"]);
    assert.deepEqual(onlyB, ["fd00::/8"]);
    assert.deepEqual(both,  ["10.0.0.0/8"]);
  });
});

describe("diffPrefixes — output is sorted", () => {
  it("onlyA is sorted ascending", () => {
    const a = ["10.0.2.0/24", "10.0.0.0/24", "10.0.1.0/24"];
    const { onlyA } = diffPrefixes(a, []);
    assert.deepEqual(onlyA, ["10.0.0.0/24", "10.0.1.0/24", "10.0.2.0/24"]);
  });

  it("both is sorted ascending", () => {
    const a = ["192.168.0.0/24", "10.0.0.0/24"];
    const b = ["10.0.0.0/24", "192.168.0.0/24"];
    const { both } = diffPrefixes(a, b);
    assert.deepEqual(both, ["10.0.0.0/24", "192.168.0.0/24"]);
  });
});

describe("diffPrefixes — dedupe interaction", () => {
  it("duplicates within a list do not appear in diff (when deduped first)", () => {
    const raw = ["10.0.0.0/24", "10.0.0.0/24", "10.0.1.0/24"];
    const deduped = dedupe(raw);
    const { onlyA } = diffPrefixes(deduped, ["10.0.1.0/24"]);
    assert.deepEqual(onlyA, ["10.0.0.0/24"]);
  });
});
