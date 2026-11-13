/**
 * CIDR prefix validation, normalization, sorting, containment, and overlap detection.
 * Works for both IPv4 and IPv6.
 */
import { parseCidr as parseV4, networkAddress as netV4, numToIp } from "./ipv4.js";
import { parseCidr as parseV6, networkAddress as netV6, ipToBigint, bigintToIp } from "./ipv6.js";

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
 *
 * Issue order matches a scan of the other entries from first to last.
 * Every covering prefix is reported, including repeated copies of one supernet.
 */
export function classify(cidrs) {
  const parsed = cidrs.map((c) => parse(c));
  const results = parsed.map((p) => ({ cidr: p.cidr, issues: [] }));
  const n = parsed.length;
  if (n < 2) return results;

  const firstIdx = new Map();
  const secondIdx = new Map();
  for (let i = 0; i < n; i++) {
    const key = parsed[i].cidr;
    if (!firstIdx.has(key)) firstIdx.set(key, i);
    else if (!secondIdx.has(key)) secondIdx.set(key, i);
  }

  const v4 = Array.from({ length: 33 }, () => []);
  const v6 = Array.from({ length: 129 }, () => []);
  for (let i = 0; i < n; i++) {
    (parsed[i].family === "v4" ? v4 : v6)[parsed[i].prefix].push(i);
  }
  const sortGroup = (g) => {
    if (g.length < 2) return;
    g.sort((ia, ib) => {
      const aa = parsed[ia].addr;
      const bb = parsed[ib].addr;
      if (aa < bb) return -1;
      if (aa > bb) return 1;
      return ia - ib;
    });
  };
  const v4Lens = [];
  const v6Lens = [];
  for (let len = 0; len <= 32; len++) {
    if (v4[len].length) { sortGroup(v4[len]); v4Lens.push(len); }
  }
  for (let len = 0; len <= 128; len++) {
    if (v6[len].length) { sortGroup(v6[len]); v6Lens.push(len); }
  }

  const covers = [];
  for (let i = 0; i < n; i++) {
    const p = parsed[i];
    const groups = p.family === "v4" ? v4 : v6;
    const lens = p.family === "v4" ? v4Lens : v6Lens;
    const bits = p.family === "v4" ? 32 : 128;
    covers.length = 0;
    for (let k = 0; k < lens.length; k++) {
      const len = lens[k];
      if (len >= p.prefix) break;
      const g = groups[len];
      const shift = BigInt(bits - len);
      const net = (p.addr >> shift) << shift;
      let lo = 0;
      let hi = g.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (parsed[g[mid]].addr < net) lo = mid + 1;
        else hi = mid;
      }
      while (lo < g.length && parsed[g[lo]].addr === net) {
        covers.push(g[lo]);
        lo++;
      }
    }

    const events = [];
    for (let c = 0; c < covers.length; c++) events.push({ j: covers[c], dup: false });
    const second = secondIdx.get(p.cidr);
    if (second !== undefined) {
      const first = firstIdx.get(p.cidr);
      events.push({ j: i === first ? second : first, dup: true });
    }
    if (events.length > 1) events.sort((a, b) => a.j - b.j);

    const issues = results[i].issues;
    let dupAdded = false;
    for (const e of events) {
      if (e.dup) {
        if (!dupAdded) { issues.push("duplicate"); dupAdded = true; }
      } else {
        issues.push(`covered_by:${parsed[e.j].cidr}`);
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
