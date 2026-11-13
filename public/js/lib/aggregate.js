/**
 * Supernet aggregation: merge contiguous sibling prefixes into their common parent.
 * Repeats until no further merges are possible.
 *
 * Prefixes are bucketed by family and length so each pass is a sort plus a
 * linear sibling check. A different-length prefix sitting between two siblings
 * does not block the merge. Covered prefixes are not removed.
 */
import { parse } from "./prefix.js";
import { numToIp } from "./ipv4.js";
import { bigintToIp } from "./ipv6.js";

function compare(a, b) {
  if (a.family !== b.family) return a.family === "v4" ? -1 : 1;
  if (a.addr < b.addr) return -1;
  if (a.addr > b.addr) return 1;
  return a.prefix - b.prefix;
}

/**
 * Parent of two same-length prefixes, or null when they are not an aligned pair.
 * `lower` must be the one with the smaller network address.
 */
function siblingParent(lower, upper) {
  if (lower.family !== upper.family || lower.prefix !== upper.prefix || lower.prefix === 0) {
    return null;
  }
  const bits = lower.family === "v4" ? 32n : 128n;
  const shift = bits - BigInt(lower.prefix);
  const lowNet = lower.addr >> shift;
  const upNet = upper.addr >> shift;
  if (lowNet !== (upNet ^ 1n) || (lowNet & 1n) !== 0n) return null;
  const parentAddr = (lowNet >> 1n) << 1n << shift;
  const prefix = lower.prefix - 1;
  const cidr = lower.family === "v4"
    ? `${numToIp(Number(parentAddr))}/${prefix}`
    : `${bigintToIp(parentAddr)}/${prefix}`;
  return { family: lower.family, addr: parentAddr, prefix, cidr };
}

/**
 * Given a list of CIDR strings (same or mixed families), return the minimally
 * aggregated list: merge sibling pairs repeatedly until stable.
 * @param {string[]} cidrs
 * @returns {string[]}
 */
export function aggregate(cidrs) {
  let items = cidrs.map((c) => parse(c.trim()));

  // Each pass shortens at least one prefix by one bit, so this cannot exceed
  // 32 rounds for IPv4 or 128 for IPv6.
  let changed = true;
  while (changed) {
    changed = false;
    const v4 = Array.from({ length: 33 }, () => []);
    const v6 = Array.from({ length: 129 }, () => []);
    for (const item of items) {
      (item.family === "v4" ? v4 : v6)[item.prefix].push(item);
    }

    const next = [];
    const fold = (bucket) => {
      if (bucket.length > 1) {
        bucket.sort((a, b) => (a.addr < b.addr ? -1 : a.addr > b.addr ? 1 : 0));
      }
      for (let i = 0; i < bucket.length; i++) {
        if (i + 1 < bucket.length) {
          const parent = siblingParent(bucket[i], bucket[i + 1]);
          if (parent) {
            next.push(parent);
            changed = true;
            i++;
            continue;
          }
        }
        next.push(bucket[i]);
      }
    };
    for (const bucket of v4) if (bucket.length) fold(bucket);
    for (const bucket of v6) if (bucket.length) fold(bucket);
    items = next;
  }

  items.sort(compare);
  return items.map((p) => p.cidr);
}
