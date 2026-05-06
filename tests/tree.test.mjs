import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCidr, numToIp } from "../public/js/lib/ipv4.js";

/**
 * Inline copy of splitSubnet — tests must not import DOM-dependent tool modules.
 * The logic is identical to tools/tree.js#splitSubnet.
 */
import { prefixToMask } from "../public/js/lib/ipv4.js";

function splitSubnet(cidr) {
  const { ip, prefix } = parseCidr(cidr);
  if (prefix >= 32) throw new Error("Cannot split a /32");
  const childPrefix = prefix + 1;
  const mask = prefixToMask(childPrefix);
  const leftNet = (ip & mask) >>> 0;
  const halfSize = 1 << (32 - childPrefix);
  const rightNet = (leftNet + halfSize) >>> 0;
  return [`${numToIp(leftNet)}/${childPrefix}`, `${numToIp(rightNet)}/${childPrefix}`];
}

describe("splitSubnet — basic splits", () => {
  it("splits /24 into two /25s", () => {
    const [left, right] = splitSubnet("10.0.0.0/24");
    assert.equal(left,  "10.0.0.0/25");
    assert.equal(right, "10.0.0.128/25");
  });

  it("splits /16 into two /17s", () => {
    const [left, right] = splitSubnet("192.168.0.0/16");
    assert.equal(left,  "192.168.0.0/17");
    assert.equal(right, "192.168.128.0/17");
  });

  it("splits /8 into two /9s", () => {
    const [left, right] = splitSubnet("10.0.0.0/8");
    assert.equal(left,  "10.0.0.0/9");
    assert.equal(right, "10.128.0.0/9");
  });

  it("splits /0 into two /1s", () => {
    const [left, right] = splitSubnet("0.0.0.0/0");
    assert.equal(left,  "0.0.0.0/1");
    assert.equal(right, "128.0.0.0/1");
  });
});

describe("splitSubnet — prefix boundary", () => {
  it("splits /31 into two /32s", () => {
    const [left, right] = splitSubnet("10.0.0.0/31");
    assert.equal(left,  "10.0.0.0/32");
    assert.equal(right, "10.0.0.1/32");
  });

  it("throws on /32 (cannot split a single host)", () => {
    assert.throws(() => splitSubnet("10.0.0.1/32"), /Cannot split a \/32/);
  });
});

describe("splitSubnet — canonical network address enforcement", () => {
  it("normalises host bits before splitting", () => {
    const [left, right] = splitSubnet("10.0.0.5/24");
    assert.equal(left,  "10.0.0.0/25");
    assert.equal(right, "10.0.0.128/25");
  });
});

describe("splitSubnet — child subnets are non-overlapping and contiguous", () => {
  it("left and right halves cover the parent without gaps", () => {
    const parent = "172.16.0.0/12";
    const [left, right] = splitSubnet(parent);

    const lp = parseCidr(left);
    const rp = parseCidr(right);
    const pp = parseCidr(parent);

    assert.equal(lp.prefix, pp.prefix + 1);
    assert.equal(rp.prefix, pp.prefix + 1);

    const halfSize = 1 << (32 - lp.prefix);
    assert.equal((lp.ip + halfSize) >>> 0, rp.ip >>> 0);
  });

  it("adjacent /26 children from a /25 parent", () => {
    const [left, right] = splitSubnet("192.168.1.0/25");
    assert.equal(left,  "192.168.1.0/26");
    assert.equal(right, "192.168.1.64/26");
  });
});
