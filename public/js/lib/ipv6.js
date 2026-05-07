/**
 * IPv6 parsing, formatting, and subnet math using BigInt (128-bit).
 * All functions are pure — no DOM, no side effects.
 */

/** @param {bigint} n @returns {string} compressed IPv6 notation */
export function bigintToIp(n) {
  n = BigInt.asUintN(128, n);
  const groups = [];
  for (let i = 7; i >= 0; i--) {
    groups.push(Number((n >> BigInt(i * 16)) & 0xffffn).toString(16));
  }
  // Find longest run of consecutive "0" groups for :: compression
  let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
  for (let i = 0; i < 8; i++) {
    if (groups[i] === "0") {
      if (curStart === -1) { curStart = i; curLen = 1; }
      else { curLen++; }
      if (curLen > bestLen) { bestStart = curStart; bestLen = curLen; }
    } else {
      curStart = -1; curLen = 0;
    }
  }
  if (bestLen < 2) return groups.join(":");
  const left = groups.slice(0, bestStart).join(":");
  const right = groups.slice(bestStart + bestLen).join(":");
  return `${left}::${right}`.replace(/^:([^:])/, "$1").replace(/([^:]):$/, "$1");
}

/** @param {string} ip @returns {bigint} */
export function ipToBigint(ip) {
  ip = ip.trim();
  if (ip.includes(".")) {
    // IPv4-mapped or embedded — normalise first
    ip = expandEmbeddedIPv4(ip);
  }
  const halves = ip.split("::");
  if (halves.length > 2) throw new Error(`Invalid IPv6: ${ip}`);
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 && left.length !== 8)
    throw new Error(`Invalid IPv6 group count: ${ip}`);
  const groups = [
    ...left,
    ...Array(halves.length === 2 ? missing : 0).fill("0"),
    ...right,
  ];
  if (groups.length !== 8) throw new Error(`Invalid IPv6: ${ip}`);
  let n = 0n;
  for (const g of groups) {
    const v = parseInt(g, 16);
    if (isNaN(v) || v < 0 || v > 0xffff) throw new Error(`Invalid IPv6 group: ${g}`);
    n = (n << 16n) | BigInt(v);
  }
  return BigInt.asUintN(128, n);
}

function expandEmbeddedIPv4(ip) {
  // Handle "::ffff:192.0.2.1" style
  const parts = ip.split(":");
  const last = parts[parts.length - 1];
  if (!last.includes(".")) return ip;
  const v4parts = last.split(".").map(Number);
  if (v4parts.length !== 4) throw new Error(`Invalid embedded IPv4: ${last}`);
  const hi = (v4parts[0] * 256 + v4parts[1]).toString(16).padStart(4, "0");
  const lo = (v4parts[2] * 256 + v4parts[3]).toString(16).padStart(4, "0");
  return [...parts.slice(0, -1), hi, lo].join(":");
}

/** Expand to full 8-group notation. @param {string} ip @returns {string} */
export function expand(ip) {
  const n = ipToBigint(ip);
  const groups = [];
  for (let i = 7; i >= 0; i--) {
    groups.push(Number((n >> BigInt(i * 16)) & 0xffffn).toString(16).padStart(4, "0"));
  }
  return groups.join(":");
}

/** Compress to shortest notation. @param {string} ip @returns {string} */
export function compress(ip) {
  return bigintToIp(ipToBigint(ip));
}

/** @param {number} prefix 0–128 @returns {bigint} */
export function prefixToMask(prefix) {
  if (prefix < 0 || prefix > 128) throw new Error(`Invalid prefix: ${prefix}`);
  if (prefix === 0) return 0n;
  return BigInt.asUintN(128, ~((1n << BigInt(128 - prefix)) - 1n));
}

/** @param {string} ip @param {number} prefix @returns {string} network address */
export function networkAddress(ip, prefix) {
  const n = ipToBigint(ip);
  const mask = prefixToMask(prefix);
  return bigintToIp(n & mask);
}

/** @param {string} ip @param {number} prefix @returns {string} last address */
export function lastAddress(ip, prefix) {
  const n = ipToBigint(ip);
  const mask = prefixToMask(prefix);
  const inv = BigInt.asUintN(128, ~mask);
  return bigintToIp((n & mask) | inv);
}

/** @param {string} ip @param {number} prefix @returns {string} first host */
export function firstHost(ip, prefix) {
  if (prefix >= 127) return networkAddress(ip, prefix);
  const n = ipToBigint(networkAddress(ip, prefix));
  return bigintToIp(n + 1n);
}

/** @param {string} ip @param {number} prefix @returns {string} last host */
export function lastHost(ip, prefix) {
  if (prefix >= 127) return lastAddress(ip, prefix);
  const n = ipToBigint(lastAddress(ip, prefix));
  return bigintToIp(n - 1n);
}

/** @param {number} prefix @returns {bigint} total addresses */
export function totalAddresses(prefix) {
  return 1n << BigInt(128 - prefix);
}

/** @param {number} prefix @returns {bigint} usable host count */
export function hostCount(prefix) {
  if (prefix >= 127) return totalAddresses(prefix);
  return totalAddresses(prefix) - 2n;
}

/**
 * Parse `ip/prefix` notation.
 * @param {string} input
 * @returns {{ip:string, prefix:number}}
 */
export function parseCidr(input) {
  input = input.trim();
  const idx = input.lastIndexOf("/");
  if (idx === -1) return { ip: compress(input), prefix: 128 };
  const ip = compress(input.slice(0, idx));
  const prefix = parseInt(input.slice(idx + 1), 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 128)
    throw new Error(`Invalid IPv6 prefix: ${input.slice(idx + 1)}`);
  return { ip, prefix };
}

/** Canonical CIDR: network address / prefix. @param {string} input @returns {string} */
export function normalize(input) {
  const { ip, prefix } = parseCidr(input);
  return `${networkAddress(ip, prefix)}/${prefix}`;
}

/**
 * Full subnet info for display.
 * @param {string} input
 * @returns {object}
 */
export function subnetInfo(input) {
  const { ip, prefix } = parseCidr(input);
  const net = networkAddress(ip, prefix);
  const last = lastAddress(ip, prefix);
  const first = firstHost(ip, prefix);
  const lh = lastHost(ip, prefix);
  const mask = prefixToMask(prefix);

  // Build expanded + compressed forms
  const expanded = expand(net);
  const compressed = compress(net);

  // Hex representation
  const n = ipToBigint(net);
  const hexStr = n.toString(16).padStart(32, "0").replace(/(.{4})/g, "$1:").slice(0, -1);

  return {
    version: 6,
    input,
    networkAddress: net,
    lastAddress: last,
    firstHost: first,
    lastHost: lh,
    hostCount: hostCount(prefix),
    totalAddresses: totalAddresses(prefix),
    prefix,
    prefixMask: bigintToIp(mask),
    expanded,
    compressed,
    hex: hexStr,
    cidr: `${net}/${prefix}`,
  };
}
