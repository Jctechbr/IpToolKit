import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregate } from "../public/js/lib/aggregate.js";

describe("aggregate", () => {
  it("merges two sibling /25s into /24", () => {
    const result = aggregate(["10.0.0.0/25", "10.0.0.128/25"]);
    assert.deepEqual(result, ["10.0.0.0/24"]);
  });

  it("merges four /26s into /24", () => {
    const result = aggregate([
      "10.0.0.128/26",
      "10.0.0.192/26",
      "10.0.0.0/26",
      "10.0.0.64/26",
    ]);
    assert.deepEqual(result, ["10.0.0.0/24"]);
  });

  it("does not merge non-sibling /24s", () => {
    const result = aggregate(["10.0.0.0/24", "10.0.2.0/24"]);
    assert.equal(result.length, 2);
  });

  it("passes through single prefix unchanged", () => {
    assert.deepEqual(aggregate(["10.0.0.0/24"]), ["10.0.0.0/24"]);
  });

  it("merges two /32s into /31", () => {
    const result = aggregate(["10.0.0.0/32", "10.0.0.1/32"]);
    assert.deepEqual(result, ["10.0.0.0/31"]);
  });

  it("handles empty input", () => {
    assert.deepEqual(aggregate([]), []);
  });

  it("merges v6 siblings", () => {
    const result = aggregate(["2001:db8::/33", "2001:db8:8000::/33"]);
    assert.deepEqual(result, ["2001:db8::/32"]);
  });

  it("keeps non-aggregatable v6 prefixes separate", () => {
    const result = aggregate(["2001:db8:1::/48", "2001:db8:3::/48"]);
    assert.equal(result.length, 2);
  });

  it("partial aggregation: merges only what it can", () => {
    const result = aggregate(["10.0.0.0/25", "10.0.0.128/25", "10.0.2.0/24"]);
    assert.equal(result.length, 2);
    assert.ok(result.includes("10.0.0.0/24"));
    assert.ok(result.includes("10.0.2.0/24"));
  });
});
