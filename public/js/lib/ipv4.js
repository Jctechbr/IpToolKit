/**
 * IPv4 parsing, formatting, and subnet math.
 * All functions are pure — no DOM, no side effects.
 */

/** @param {number} n @returns {string} */
export function numToIp(n) {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join(".");
}

/** @param {string} ip @returns {number} unsigned 32-bit int */
export function ipToNum(ip) {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) throw new Error(`Invalid IPv4: ${ip}`);
  let n = 0;
  for (const p of parts) {
    const b = parseInt(p, 10);
    if (isNaN(b) || b < 0 || b > 255 || String(b) !== p.trim())
      throw new Error(`Invalid IPv4 octet: ${p}`);
    n = (n * 256 + b) >>> 0;
  }
  return n >>> 0;
}

/** @param {number} prefix 0–32 @returns {number} netmask as uint32 */
export function prefixToMask(prefix) {
  if (prefix < 0 || prefix > 32) throw new Error(`Invalid prefix: ${prefix}`);
  if (prefix === 0) return 0;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

/** @param {number} mask uint32 @returns {number} prefix length */
export function maskToPrefix(mask) {
  mask = mask >>> 0;
  // Verify it is a valid contiguous mask
  const inv = (~mask) >>> 0;
  if (((inv + 1) & inv) !== 0) throw new Error(`Non-contiguous mask: ${numToIp(mask)}`);
  let n = 0;
  let m = mask;
  while (m & 0x80000000) { n++; m = (m << 1) >>> 0; }
  return n;
}

/**
 * Parse CIDR `10.0.0.0/24`, `10.0.0.0 255.255.255.0`,
 * `10.0.0.0 0.0.0.255` (wildcard), or bare host `10.0.0.1`.
 * @returns {{ip:number, prefix:number}}
 */
export function parseCidr(input) {
  input = input.trim();
  // CIDR notation
  const slashIdx = input.indexOf("/");
  if (slashIdx !== -1) {
    const ip = ipToNum(input.slice(0, slashIdx));
    const prefix = parseInt(input.slice(slashIdx + 1), 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32)
      throw new Error(`Invalid prefix length: ${input.slice(slashIdx + 1)}`);
    return { ip, prefix };
  }
  // IP + mask or wildcard (space or tab separated)
  const spaceIdx = input.search(/\s/);
  if (spaceIdx !== -1) {
    const ip = ipToNum(input.slice(0, spaceIdx));
    const maskStr = input.slice(spaceIdx).trim();
    const maskNum = ipToNum(maskStr);
    // Detect wildcard mask vs netmask by checking if it looks inverted
    const isWildcard = (maskNum & 0x80000000) === 0 && maskNum !== 0 && ((maskNum + 1) & maskNum) === 0;
    const prefix = isWildcard ? maskToPrefix((~maskNum) >>> 0) : maskToPrefix(maskNum);
    return { ip, prefix };
  }
  // Bare host address — /32
  return { ip: ipToNum(input), prefix: 32 };
}

/** @param {{ip:number,prefix:number}} cidr @returns {number} network address */
export function networkAddress({ ip, prefix }) {
  return (ip & prefixToMask(prefix)) >>> 0;
}

/** @param {{ip:number,prefix:number}} cidr @returns {number} broadcast address */
export function broadcastAddress({ ip, prefix }) {
  const mask = prefixToMask(prefix);
  return (networkAddress({ ip, prefix }) | (~mask >>> 0)) >>> 0;
}

/** @param {{ip:number,prefix:number}} cidr @returns {number} first usable host */
export function firstHost({ ip, prefix }) {
  if (prefix >= 31) return networkAddress({ ip, prefix });
  return (networkAddress({ ip, prefix }) + 1) >>> 0;
}

/** @param {{ip:number,prefix:number}} cidr @returns {number} last usable host */
export function lastHost({ ip, prefix }) {
  if (prefix >= 31) return broadcastAddress({ ip, prefix });
  return (broadcastAddress({ ip, prefix }) - 1) >>> 0;
}

/**
 * Total host addresses in the subnet.
 * /31 = 2 (point-to-point), /32 = 1 (loopback).
 * @returns {number}
 */
export function hostCount({ prefix }) {
  if (prefix === 32) return 1;
  if (prefix === 31) return 2;
  return Math.pow(2, 32 - prefix) - 2;
}

/** Total addresses (including network + broadcast). @returns {number} */
export function totalAddresses({ prefix }) {
  return Math.pow(2, 32 - prefix);
}

/** @returns {string} e.g. "0.0.0.255" */
export function wildcardMask(prefix) {
  return numToIp((~prefixToMask(prefix)) >>> 0);
}

/** @param {number} ip @returns {string} dotted-hex e.g. "0x0a.0x00.0x00.0x00" */
export function toHex(ip) {
  return [
    (ip >>> 24) & 0xff,
    (ip >>> 16) & 0xff,
    (ip >>> 8) & 0xff,
    ip & 0xff,
  ]
    .map((b) => "0x" + b.toString(16).padStart(2, "0"))
    .join(".");
}

/** @param {number} ip @returns {string} 32-char binary string with dots every 8 */
export function toBinary(ip) {
  return [
    (ip >>> 24) & 0xff,
    (ip >>> 16) & 0xff,
    (ip >>> 8) & 0xff,
    ip & 0xff,
  ]
    .map((b) => b.toString(2).padStart(8, "0"))
    .join(".");
}

/**
 * Normalize a CIDR to its canonical (network) address form.
 * @param {string} cidr
 * @returns {string} e.g. "10.0.0.0/24"
 */
export function normalize(cidr) {
  const parsed = parseCidr(cidr);
  const net = networkAddress(parsed);
  return `${numToIp(net)}/${parsed.prefix}`;
}

/**
 * Full subnet info for display.
 * @param {string} input
 * @returns {object}
 */
export function subnetInfo(input) {
  const parsed = parseCidr(input);
  const net = networkAddress(parsed);
  const bcast = broadcastAddress(parsed);
  const first = firstHost(parsed);
  const last = lastHost(parsed);
  const mask = prefixToMask(parsed.prefix);
  return {
    version: 4,
    input,
    networkAddress: numToIp(net),
    broadcastAddress: numToIp(bcast),
    firstHost: numToIp(first),
    lastHost: numToIp(last),
    hostCount: hostCount(parsed),
    totalAddresses: totalAddresses(parsed),
    prefix: parsed.prefix,
    netmask: numToIp(mask),
    wildcardMask: wildcardMask(parsed.prefix),
    hex: toHex(net),
    binary: toBinary(net),
    cidr: `${numToIp(net)}/${parsed.prefix}`,
  };
}
