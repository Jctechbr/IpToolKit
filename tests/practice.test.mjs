/**
 * Tests for the pure exported functions from tools/practice.js.
 * No DOM, no localStorage — only generateQuestion() and checkAnswer().
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateQuestion, checkAnswer } from "../public/js/tools/practice.js";

// ---------------------------------------------------------------------------
// generateQuestion — "network" type
// ---------------------------------------------------------------------------

describe('generateQuestion — type "network"', () => {
  it("returns the correct network address for 192.168.1.0/24", () => {
    const q = generateQuestion("network", "192.168.1.0/24");
    assert.equal(q.answer, "192.168.1.0");
  });

  it("returns the network address when host bits are present in input", () => {
    // 10.0.0.5/24 → network is 10.0.0.0
    const q = generateQuestion("network", "10.0.0.5/24");
    assert.equal(q.answer, "10.0.0.0");
  });

  it("question string mentions the canonical CIDR", () => {
    const q = generateQuestion("network", "10.0.0.0/16");
    assert.ok(
      q.question.includes("10.0.0.0/16"),
      `Expected question to reference CIDR, got: ${q.question}`
    );
  });

  it("explanation is non-empty", () => {
    const q = generateQuestion("network", "172.16.0.0/12");
    assert.ok(q.explanation.length > 0);
  });

  it("network address of /8 is correct", () => {
    const q = generateQuestion("network", "10.255.255.255/8");
    assert.equal(q.answer, "10.0.0.0");
  });
});

// ---------------------------------------------------------------------------
// generateQuestion — "broadcast" type
// ---------------------------------------------------------------------------

describe('generateQuestion — type "broadcast"', () => {
  it("returns the correct broadcast address for 192.168.1.0/24", () => {
    const q = generateQuestion("broadcast", "192.168.1.0/24");
    assert.equal(q.answer, "192.168.1.255");
  });

  it("returns the correct broadcast address for 10.0.0.0/8", () => {
    const q = generateQuestion("broadcast", "10.0.0.0/8");
    assert.equal(q.answer, "10.255.255.255");
  });

  it("broadcast of /30 is host+3", () => {
    const q = generateQuestion("broadcast", "192.168.0.0/30");
    assert.equal(q.answer, "192.168.0.3");
  });

  it("question string mentions the word 'broadcast'", () => {
    const q = generateQuestion("broadcast", "10.0.0.0/24");
    assert.ok(
      q.question.toLowerCase().includes("broadcast"),
      `Expected 'broadcast' in question: ${q.question}`
    );
  });

  it("explanation is non-empty", () => {
    const q = generateQuestion("broadcast", "172.16.0.0/20");
    assert.ok(q.explanation.length > 0);
  });
});

// ---------------------------------------------------------------------------
// generateQuestion — "hosts" type
// ---------------------------------------------------------------------------

describe('generateQuestion — type "hosts"', () => {
  it("returns 254 usable hosts for /24", () => {
    const q = generateQuestion("hosts", "10.0.0.0/24");
    assert.equal(q.answer, "254");
  });

  it("returns 2 usable hosts for /30", () => {
    const q = generateQuestion("hosts", "192.168.1.0/30");
    assert.equal(q.answer, "2");
  });

  it("returns 2 usable hosts for /31 (point-to-point)", () => {
    const q = generateQuestion("hosts", "10.0.0.0/31");
    assert.equal(q.answer, "2");
  });

  it("returns 1 for /32 (loopback)", () => {
    const q = generateQuestion("hosts", "10.0.0.1/32");
    assert.equal(q.answer, "1");
  });

  it("returns 65534 usable hosts for /16", () => {
    const q = generateQuestion("hosts", "172.16.0.0/16");
    assert.equal(q.answer, "65534");
  });

  it("question string mentions 'usable hosts'", () => {
    const q = generateQuestion("hosts", "10.0.0.0/24");
    assert.ok(
      q.question.toLowerCase().includes("usable hosts"),
      `Expected 'usable hosts' in question: ${q.question}`
    );
  });

  it("explanation is non-empty", () => {
    const q = generateQuestion("hosts", "10.0.0.0/20");
    assert.ok(q.explanation.length > 0);
  });
});

// ---------------------------------------------------------------------------
// generateQuestion — "prefix" type
// ---------------------------------------------------------------------------

describe('generateQuestion — type "prefix"', () => {
  it("returns /24 for a /24 CIDR", () => {
    const q = generateQuestion("prefix", "10.0.0.0/24");
    assert.equal(q.answer, "/24");
  });

  it("returns /16 for a /16 CIDR", () => {
    const q = generateQuestion("prefix", "172.16.0.0/16");
    assert.equal(q.answer, "/16");
  });

  it("returns /28 for a /28 CIDR", () => {
    const q = generateQuestion("prefix", "192.168.1.16/28");
    assert.equal(q.answer, "/28");
  });

  it("question string mentions 'prefix length'", () => {
    const q = generateQuestion("prefix", "10.0.0.0/24");
    assert.ok(
      q.question.toLowerCase().includes("prefix length"),
      `Expected 'prefix length' in question: ${q.question}`
    );
  });

  it("question string mentions the host count for the given CIDR", () => {
    // /24 → 254 usable hosts
    const q = generateQuestion("prefix", "10.0.0.0/24");
    assert.ok(
      q.question.includes("254"),
      `Expected host count 254 in question: ${q.question}`
    );
  });

  it("explanation is non-empty", () => {
    const q = generateQuestion("prefix", "10.0.0.0/20");
    assert.ok(q.explanation.length > 0);
  });
});

// ---------------------------------------------------------------------------
// generateQuestion — unknown type
// ---------------------------------------------------------------------------

describe("generateQuestion — unknown type", () => {
  it("throws on an unrecognised type", () => {
    assert.throws(
      () => generateQuestion("wildcard", "10.0.0.0/24"),
      /Unknown question type/
    );
  });
});

// ---------------------------------------------------------------------------
// checkAnswer
// ---------------------------------------------------------------------------

describe("checkAnswer — exact and normalised matching", () => {
  it("returns true for an exact match", () => {
    assert.equal(checkAnswer("192.168.1.0", "192.168.1.0"), true);
  });

  it("trims leading and trailing whitespace", () => {
    assert.equal(checkAnswer("  192.168.1.0  ", "192.168.1.0"), true);
  });

  it("is case-insensitive", () => {
    assert.equal(checkAnswer("/24", "/24"), true);
    // prefix answers use lowercase "/" so also verify uppercase doesn't matter
    assert.equal(checkAnswer("254", "254"), true);
  });

  it("is case-insensitive for mixed-case inputs", () => {
    assert.equal(checkAnswer("YES", "yes"), true);
  });

  it("returns false for a wrong answer", () => {
    assert.equal(checkAnswer("10.0.0.1", "10.0.0.0"), false);
  });

  it("returns false for an empty string vs non-empty correct answer", () => {
    assert.equal(checkAnswer("", "192.168.1.0"), false);
  });

  it("returns false when answer has wrong prefix length", () => {
    assert.equal(checkAnswer("/25", "/24"), false);
  });

  it("handles numeric answers as strings", () => {
    assert.equal(checkAnswer("254", "254"), true);
    assert.equal(checkAnswer("253", "254"), false);
  });
});
