import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyCidrs } from "../public/js/tools/patterns.js";

describe("classifyCidrs — aggregation", () => {
  it("merges two sibling /25s into one /24", () => {
    const { aggregated } = classifyCidrs(["10.0.0.0/25", "10.0.0.128/25"]);
    assert.deepEqual(aggregated, ["10.0.0.0/24"]);
  });

  it("reduces prefix count when siblings exist", () => {
    const input = [
      "10.0.0.0/24",
      "10.0.1.0/24",
      "192.168.0.0/16",
    ];
    const { aggregated } = classifyCidrs(input);
    assert.ok(
      aggregated.length < input.length,
      `Expected fewer than ${input.length}, got ${aggregated.length}`
    );
    assert.ok(aggregated.includes("10.0.0.0/23"));
  });

  it("returns the same list when no aggregation is possible", () => {
    const input = ["10.0.0.0/24", "10.0.2.0/24"];
    const { aggregated } = classifyCidrs(input);
    assert.equal(aggregated.length, 2);
  });

  it("handles a single prefix without modifying it", () => {
    const { aggregated } = classifyCidrs(["172.16.0.0/12"]);
    assert.deepEqual(aggregated, ["172.16.0.0/12"]);
  });

  it("handles empty input", () => {
    const { aggregated } = classifyCidrs([]);
    assert.deepEqual(aggregated, []);
  });
});

describe("classifyCidrs — rfcCounts", () => {
  it("counts private RFC1918 prefixes", () => {
    const { rfcCounts } = classifyCidrs([
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16",
    ]);
    const privateCount = rfcCounts.get("Private (RFC1918)");
    assert.equal(privateCount, 3);
  });

  it("counts loopback prefix", () => {
    const { rfcCounts } = classifyCidrs(["127.0.0.0/8"]);
    const count = rfcCounts.get("Loopback");
    assert.ok(count >= 1, "Expected at least 1 Loopback entry");
  });

  it("counts multicast prefix", () => {
    const { rfcCounts } = classifyCidrs(["224.0.0.0/4"]);
    const count = rfcCounts.get("Multicast");
    assert.ok(count >= 1, "Expected at least 1 Multicast entry");
  });

  it("counts global unicast for public addresses", () => {
    const { rfcCounts } = classifyCidrs(["8.8.8.0/24", "1.1.1.0/24"]);
    const publicCount = rfcCounts.get("Public (Global Unicast)");
    assert.equal(publicCount, 2);
  });

  it("counts ULA for IPv6 fc00::/7 space", () => {
    const { rfcCounts } = classifyCidrs(["fd00::/8"]);
    const count = rfcCounts.get("Unique Local (RFC4193)");
    assert.ok(count >= 1, "Expected at least 1 ULA entry");
  });

  it("accumulates counts across multiple prefixes of the same tag", () => {
    const { rfcCounts } = classifyCidrs([
      "10.1.0.0/16",
      "10.2.0.0/16",
      "192.168.1.0/24",
    ]);
    const count = rfcCounts.get("Private (RFC1918)");
    assert.equal(count, 3);
  });

  it("returns an empty map for empty input", () => {
    const { rfcCounts } = classifyCidrs([]);
    assert.equal(rfcCounts.size, 0);
  });
});

describe("classifyCidrs — histogram", () => {
  it("counts prefixes per length", () => {
    const { histogram } = classifyCidrs([
      "10.0.0.0/24",
      "10.0.1.0/24",
      "192.168.0.0/16",
    ]);
    assert.equal(histogram.get(24), 2);
    assert.equal(histogram.get(16), 1);
  });

  it("handles a single prefix", () => {
    const { histogram } = classifyCidrs(["10.0.0.0/8"]);
    assert.equal(histogram.get(8), 1);
  });

  it("counts mixed IPv4 prefix lengths independently", () => {
    const { histogram } = classifyCidrs([
      "10.0.0.0/24",
      "10.0.1.0/25",
      "10.0.2.0/25",
      "10.0.3.0/30",
    ]);
    assert.equal(histogram.get(24), 1);
    assert.equal(histogram.get(25), 2);
    assert.equal(histogram.get(30), 1);
    assert.equal(histogram.get(8), undefined);
  });

  it("does not have keys for prefix lengths not present", () => {
    const { histogram } = classifyCidrs(["10.0.0.0/24"]);
    assert.equal(histogram.get(16), undefined);
    assert.equal(histogram.get(32), undefined);
  });

  it("returns an empty map for empty input", () => {
    const { histogram } = classifyCidrs([]);
    assert.equal(histogram.size, 0);
  });

  it("counts IPv6 prefix lengths", () => {
    const { histogram } = classifyCidrs([
      "2001:db8::/32",
      "fd00::/8",
      "fd01::/8",
    ]);
    assert.equal(histogram.get(32), 1);
    assert.equal(histogram.get(8), 2);
  });
});
