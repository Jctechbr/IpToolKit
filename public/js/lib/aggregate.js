/**
 * Supernet aggregation: merge contiguous sibling prefixes into their common parent.
 * Repeats until no further merges are possible.
 */
import { parse, areSiblings } from "./prefix.js";
import { numToIp, prefixToMask as maskV4 } from "./ipv4.js";
import { bigintToIp, prefixToMask as maskV6 } from "./ipv6.js";

/**
 * Given a list of CIDR strings (same or mixed families), return the minimally
 * aggregated list: merge sibling pairs repeatedly until stable.
 * @param {string[]} cidrs
 * @returns {string[]}
 */
export function aggregate(cidrs) {
  // Work with parsed objects; keep family-separated lists for merging
  let items = cidrs.map((c) => parse(c.trim()));

  let changed = true;
  while (changed) {
    changed = false;
    // Sort so siblings are adjacent
    items.sort((a, b) => {
      if (a.family !== b.family) return a.family === "v4" ? -1 : 1;
      if (a.addr < b.addr) return -1;
      if (a.addr > b.addr) return 1;
      return a.prefix - b.prefix;
    });

    const next = [];
    const used = new Set();

    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      let merged = false;
      for (let j = i + 1; j < items.length; j++) {
        if (used.has(j)) continue;
        if (items[i].family !== items[j].family) break; // different family, skip
        if (items[i].prefix !== items[j].prefix) continue; // different prefix length
        if (areSiblings(items[i].cidr, items[j].cidr)) {
          // Merge: compute parent address (clear the last prefix bit)
          const newPrefix = items[i].prefix - 1;
          const bits = items[i].family === "v4" ? 32n : 128n;
          const shift = bits - BigInt(items[i].prefix);
          // Parent network = zero out the last bit of the host part
          const parentAddr = (items[i].addr >> shift) >> 1n << 1n << shift;
          const parentCidr = items[i].family === "v4"
            ? `${numToIp(Number(parentAddr))}/${newPrefix}`
            : `${bigintToIp(parentAddr)}/${newPrefix}`;
          next.push(parse(parentCidr));
          used.add(i);
          used.add(j);
          changed = true;
          merged = true;
          break;
        }
      }
      if (!merged) next.push(items[i]);
    }
    items = next;
  }

  // Final sort and return CIDRs
  items.sort((a, b) => {
    if (a.family !== b.family) return a.family === "v4" ? -1 : 1;
    if (a.addr < b.addr) return -1;
    if (a.addr > b.addr) return 1;
    return a.prefix - b.prefix;
  });
  return items.map((p) => p.cidr);
}
