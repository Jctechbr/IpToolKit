/**
 * CIDR prefix validation, normalization, sorting, containment, and overlap detection.
 * Works for both IPv4 and IPv6.
 */
import { parseCidr as parseV4, networkAddress as netV4, ipToNum, numToIp, prefixToMask as maskV4 } from "./ipv4.js";
import { parseCidr as parseV6, networkAddress as netV6, ipToBigint, prefixToMask as maskV6, bigintToIp } from "./ipv6.js";

/** Detect address family from a CIDR string. @returns {"v4"|"v6"} */
export function family(cidr) {
  return cidr.includes(":") ? "v6" : "v4";
}

/**
 * Validate and normalize a CIDR string.
 * Returns canonical form (network address / prefix) or throws.
 */
export function normalize(cidr) {
  cidr = cidr.trim();
  if (family(cidr) === "v4") {
    const { ip, prefix } = parseV4(cidr);
    const net = netV4({ ip, prefix });
    return `${numToIp(net)}/${prefix}`;
  } else {
    const { ip, prefix } = parseV6(cidr);
    const net = netV6(ip, prefix);
    return `${net}/${prefix}`;
  }
}

/**
 * Parse a CIDR to a unified representation.
 * @returns {{family:"v4"|"v6", addr:bigint, prefix:number, cidr:string}}
 */
export function parse(cidr) {
  cidr = cidr.trim();
  const f = family(cidr);
  if (f === "v4") {
    const { ip, prefix } = parseV4(cidr);
    const net = netV4({ ip, prefix });
    return { family: "v4", addr: BigInt(net >>> 0), prefix, cidr: `${numToIp(net)}/${prefix}` };
  } else {
    const { ip, prefix } = parseV6(cidr);
    const net = netV6(ip, prefix);
    return { family: "v6", addr: ipToBigint(net), prefix, cidr: `${net}/${prefix}` };
  }
}

/** Compare two parsed prefixes: sort by address ascending, then prefix length ascending. */
function compare(a, b) {
  if (a.family !== b.family) return a.family === "v4" ? -1 : 1;
  if (a.addr < b.addr) return -1;
  if (a.addr > b.addr) return 1;
  return a.prefix - b.prefix;
}

/** Sort an array of CIDR strings. @returns {string[]} */
export function sort(cidrs) {
  return cidrs.map(parse).sort(compare).map((p) => p.cidr);
}

/**
 * Deduplicate an array of CIDRs (after normalization).
 * @returns {string[]}
 */
export function dedupe(cidrs) {
  const seen = new Set();
  const result = [];
  for (const c of cidrs) {
    const norm = normalize(c);
    if (!seen.has(norm)) { seen.add(norm); result.push(norm); }
  }
  return result;
}

/**
 * Return true if `outer` contains `inner` (outer is equal to or a supernet of inner).
 * Both must be the same address family.
 */
export function contains(outer, inner) {
  const o = parse(outer);
  const i = parse(inner);
  if (o.family !== i.family) return false;
  if (o.prefix > i.prefix) return false;
  const bits = o.family === "v4" ? 32n : 128n;
  const shift = bits - BigInt(o.prefix);
  return (o.addr >> shift) === (i.addr >> shift);
}

/**
 * Return true if two prefixes overlap (one contains the other or they are equal).
 * Different address families never overlap.
 */
export function overlaps(a, b) {
  return contains(a, b) || contains(b, a);
}

/**
 * Classify relationships in a list of CIDRs.
 * Returns array of {cidr, issues} where issues is an array of strings.
 * Issues: "duplicate", "covered_by:<other>"
 */
export function classify(cidrs) {
  const parsed = cidrs.map((c) => parse(normalize(c)));
  const results = parsed.map((p) => ({ cidr: p.cidr, issues: [] }));

  for (let i = 0; i < parsed.length; i++) {
    for (let j = 0; j < parsed.length; j++) {
      if (i === j) continue;
      if (parsed[i].cidr === parsed[j].cidr) {
        if (!results[i].issues.includes("duplicate"))
          results[i].issues.push("duplicate");
      } else if (contains(parsed[j].cidr, parsed[i].cidr)) {
        results[i].issues.push(`covered_by:${parsed[j].cidr}`);
      }
    }
  }
  return results;
}

/**
 * Check if two prefixes of the same length are "siblings"
 * (differ only in the last bit of the network part → can merge to /n-1).
 */
export function areSiblings(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  if (pa.family !== pb.family || pa.prefix !== pb.prefix) return false;
  const bits = pa.family === "v4" ? 32n : 128n;
  const shift = bits - BigInt(pa.prefix);
  return (pa.addr >> shift) === ((pb.addr >> shift) ^ 1n);
}
