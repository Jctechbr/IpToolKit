/**
 * Routing table parsing and longest-prefix-match lookup.
 *
 * All functions are pure — no DOM access, no side effects.
 * Supports IPv4 only; uses ipv4.js for address arithmetic.
 */
import { ipToNum, parseCidr, networkAddress, prefixToMask } from "./ipv4.js";

/**
 * @typedef {Object} RouteEntry
 * @property {string} prefix   - Canonical CIDR string, e.g. "10.0.0.0/8"
 * @property {string} nexthop  - Next-hop IP address string
 */

/**
 * @typedef {Object} MatchEntry
 * @property {string} prefix
 * @property {string} nexthop
 * @property {number} prefixLen
 */

/**
 * @typedef {Object} LongestMatchResult
 * @property {MatchEntry[]} matches - All matching routes, sorted by prefix length descending
 * @property {MatchEntry|null} winner - Best match (longest prefix), or null if none
 */

/** Regex for "10.0.0.0/8 via 192.168.1.1" or "10.0.0.0/8 192.168.1.1" */
const LINE_RE =
  /^\s*(\S+)\s+(?:via\s+)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*$/i;

/**
 * Parse a routing table text block into structured entries.
 *
 * Accepts two line formats:
 *   "10.0.0.0/8 via 192.168.1.1"
 *   "10.0.0.0/8 192.168.1.1"
 *
 * Blank lines and lines starting with "#" are silently skipped.
 * Malformed lines throw an Error; the caller decides whether to skip or halt.
 *
 * @param {string} text - Raw routing table text
 * @returns {RouteEntry[]}
 * @throws {Error} When a non-blank, non-comment line cannot be parsed
 */
export function parseTable(text) {
  const entries = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Skip blank lines and comment lines
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const match = LINE_RE.exec(trimmed);
    if (!match) {
      throw new Error(
        `Line ${i + 1}: cannot parse routing entry — expected "<prefix> [via] <nexthop>", got: "${trimmed}"`
      );
    }

    const prefixRaw = match[1];
    const nexthop = match[2];

    // Validate the prefix by parsing it; this throws on bad input
    const parsed = parseCidr(prefixRaw);
    const netNum = networkAddress(parsed);
    const canonicalPrefix = `${_numToIpLocal(netNum)}/${parsed.prefix}`;

    entries.push({ prefix: canonicalPrefix, nexthop });
  }

  return entries;
}

/**
 * Find all routes in `table` that match `destIp`, sorted by prefix length
 * descending (most-specific first).
 *
 * A route matches when `destIp` falls within the route's network:
 *   (ipToNum(destIp) & mask) === networkAddress
 *
 * The default route 0.0.0.0/0 has mask=0, so it matches any address.
 *
 * @param {RouteEntry[]} table - Parsed routing table from parseTable()
 * @param {string} destIp - Destination IPv4 address, e.g. "10.1.2.3"
 * @returns {LongestMatchResult}
 * @throws {Error} When `destIp` is not a valid IPv4 address
 */
export function longestMatch(table, destIp) {
  const destNum = ipToNum(destIp);

  /** @type {MatchEntry[]} */
  const matches = [];

  for (const entry of table) {
    const parsed = parseCidr(entry.prefix);
    const mask = prefixToMask(parsed.prefix);
    const net = networkAddress(parsed);

    if ((destNum & mask) >>> 0 === net >>> 0) {
      matches.push({
        prefix: entry.prefix,
        nexthop: entry.nexthop,
        prefixLen: parsed.prefix,
      });
    }
  }

  // Sort descending by prefix length — longest (most-specific) first
  matches.sort((a, b) => b.prefixLen - a.prefixLen);

  return {
    matches,
    winner: matches.length > 0 ? matches[0] : null,
  };
}

// ---------------------------------------------------------------------------
// Internal helper — avoids importing numToIp and creating a circular risk
// (ipv4.js is already the canonical source; this mirrors it locally for the
// one place we need it inside this pure lib file).
// ---------------------------------------------------------------------------

/**
 * Convert a 32-bit unsigned integer to dotted-decimal notation.
 * @param {number} n
 * @returns {string}
 */
function _numToIpLocal(n) {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join(".");
}
