import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalize, parse, sort, dedupe, contains, overlaps, areSiblings, classify } from "../public/js/lib/prefix.js";

describe("normalize", () => {
  it("v4 canonicalizes host bits", () => {
    assert.equal(normalize("10.0.0.5/24"), "10.0.0.0/24");
  });
  it("v6 canonicalizes", () => {
    assert.equal(normalize("2001:db8::1/32"), "2001:db8::/32");
  });
});

describe("sort", () => {
  it("sorts v4 prefixes by address then length", () => {
    const sorted = sort(["10.0.1.0/24", "10.0.0.0/24", "10.0.0.0/16"]);
    assert.equal(sorted[0], "10.0.0.0/16");
    assert.equal(sorted[1], "10.0.0.0/24");
    assert.equal(sorted[2], "10.0.1.0/24");
  });

  it("puts v4 before v6", () => {
    const sorted = sort(["2001:db8::/32", "10.0.0.0/8"]);
    assert.ok(sorted[0].includes("."));
  });
});

describe("dedupe", () => {
  it("removes exact duplicates", () => {
    const d = dedupe(["10.0.0.0/24", "10.0.0.0/24", "10.0.1.0/24"]);
    assert.equal(d.length, 2);
  });
  it("keeps different-prefix same-address", () => {
    const d = dedupe(["10.0.0.0/24", "10.0.0.0/16"]);
    assert.equal(d.length, 2);
  });
});

describe("contains", () => {
  it("supernet contains subnet", () => {
    assert.ok(contains("10.0.0.0/16", "10.0.1.0/24"));
  });
  it("equal prefixes contain each other", () => {
    assert.ok(contains("10.0.0.0/24", "10.0.0.0/24"));
  });
  it("subnet does not contain supernet", () => {
    assert.ok(!contains("10.0.1.0/24", "10.0.0.0/16"));
  });
  it("non-overlapping", () => {
    assert.ok(!contains("10.0.0.0/24", "10.0.1.0/24"));
  });
  it("v6 containment", () => {
    assert.ok(contains("2001:db8::/32", "2001:db8:1::/48"));
  });
  it("different families are never contained", () => {
    assert.ok(!contains("10.0.0.0/8", "::1/128"));
  });
});

describe("overlaps", () => {
  it("detects containment as overlap", () => {
    assert.ok(overlaps("10.0.0.0/16", "10.0.1.0/24"));
  });
  it("equal prefixes overlap", () => {
    assert.ok(overlaps("10.0.0.0/24", "10.0.0.0/24"));
  });
  it("non-overlapping returns false", () => {
    assert.ok(!overlaps("10.0.0.0/24", "10.0.2.0/24"));
  });
});

describe("areSiblings", () => {
  it("recognises adjacent /25s", () => {
    assert.ok(areSiblings("10.0.0.0/25", "10.0.0.128/25"));
  });
  it("non-adjacent /24s are not siblings", () => {
    assert.ok(!areSiblings("10.0.0.0/24", "10.0.2.0/24"));
  });
  it("different prefix lengths are not siblings", () => {
    assert.ok(!areSiblings("10.0.0.0/24", "10.0.0.0/25"));
  });
  it("v6 siblings", () => {
    assert.ok(areSiblings("2001:db8::/33", "2001:db8:8000::/33"));
  });
});

describe("classify (overlap/duplicate detection)", () => {
  it("detects duplicates", () => {
    const result = classify(["10.0.0.0/24", "10.0.0.0/24"]);
    assert.ok(result.some(r => r.issues.includes("duplicate")));
  });
  it("detects covered_by", () => {
    const result = classify(["10.0.0.0/16", "10.0.1.0/24"]);
    const covered = result.find(r => r.cidr === "10.0.1.0/24");
    assert.ok(covered.issues.some(i => i.startsWith("covered_by")));
  });
  it("clean list has no issues", () => {
    const result = classify(["10.0.0.0/24", "10.0.1.0/24"]);
    assert.ok(result.every(r => r.issues.length === 0));
  });
  it("caps repeated covering prefixes and reports the remainder", () => {
    const supernets = Array.from({ length: 40 }, () => "10.0.0.0/8");
    const result = classify([...supernets, "10.1.0.0/24"]);
    const covered = result.find(r => r.cidr === "10.1.0.0/24");
    const listed = covered.issues.filter(i => i.startsWith("covered_by:"));
    assert.equal(listed.length, 32);
    assert.equal(covered.issues.at(-1), "+8 more");
    assert.ok(result.filter(r => r.cidr === "10.0.0.0/8").every(r => r.issues.includes("duplicate")));
  });
  it("does not add a remainder line when the cover count is at the cap", () => {
    const supernets = Array.from({ length: 32 }, () => "10.0.0.0/8");
    const result = classify([...supernets, "10.1.0.0/24"]);
    const covered = result.find(r => r.cidr === "10.1.0.0/24");
    assert.equal(covered.issues.length, 32);
    assert.ok(covered.issues.every(i => i.startsWith("covered_by:")));
  });
});
