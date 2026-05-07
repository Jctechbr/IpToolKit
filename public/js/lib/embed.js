/**
 * IPv4-in-IPv6 embedding and extraction.
 * Supports: IPv4-mapped, 6to4, NAT64 (well-known + custom), SIIT/IVI.
 */
import { ipToNum, numToIp, parseCidr as parseV4 } from "./ipv4.js";
import { ipToBigint, bigintToIp, parseCidr as parseV6 } from "./ipv6.js";

export const MODES = {
  "ipv4-mapped":      { label: "IPv4-Mapped (::ffff:0:0/96)",        prefix: "::ffff:0:0",     offset: 0n },
  "6to4":             { label: "6to4 (2002::/16)",                   special: true },
  "nat64-wk":         { label: "NAT64 Well-Known (64:ff9b::/96)",    prefix: "64:ff9b::",       offset: 0n },
  "nat64-custom":     { label: "NAT64 Custom /96 prefix",            custom: true },
  "siit":             { label: "SIIT/IVI Custom /96 prefix",         custom: true },
  "ipv4-compatible":  { label: "IPv4-Compatible (deprecated, ::/96)",prefix: "::",              offset: 0n },
};

/**
 * Embed an IPv4 address into an IPv6 address.
 * @param {string} ipv4   e.g. "192.0.2.1"
 * @param {string} mode   one of the MODES keys
 * @param {string} [customPrefix]  required when mode is "nat64-custom" or "siit"
 * @returns {string}  compressed IPv6
 */
export function embed(ipv4, mode, customPrefix) {
  const v4num = ipToNum(ipv4);
  const v4big = BigInt(v4num >>> 0);

  if (mode === "6to4") {
    // 2002:<v4-hi>:<v4-lo>::/48
    const hi = (v4big >> 16n) & 0xffffn;
    const lo = v4big & 0xffffn;
    const n = (0x2002n << 112n) | (hi << 96n) | (lo << 80n);
    return bigintToIp(n);
  }

  if (mode === "nat64-custom" || mode === "siit") {
    if (!customPrefix) throw new Error("Custom prefix required for this mode");
    const { ip, prefix } = parseV6(customPrefix);
    if (prefix !== 96) throw new Error("Custom NAT64/SIIT prefix must be /96");
    const base = ipToBigint(ip);
    return bigintToIp(base | v4big);
  }

  // All /96 prefix modes
  const def = MODES[mode];
  if (!def) throw new Error(`Unknown embed mode: ${mode}`);
  const base = ipToBigint(def.prefix);
  return bigintToIp(base | v4big);
}

/**
 * Attempt to extract an embedded IPv4 address from an IPv6 address.
 * @param {string} ipv6
 * @param {string} [customPrefix]  for custom NAT64/SIIT — checked first
 * @returns {{mode:string, ipv4:string}|null}
 */
export function extract(ipv6, customPrefix) {
  const n = ipToBigint(ipv6);

  // 6to4: top 16 bits = 0x2002
  if ((n >> 112n) === 0x2002n) {
    const v4big = (n >> 80n) & 0xffffffffn;
    return { mode: "6to4", ipv4: numToIp(Number(v4big)) };
  }

  // Custom prefix check first
  if (customPrefix) {
    try {
      const { ip, prefix } = parseV6(customPrefix);
      if (prefix === 96) {
        const base = ipToBigint(ip);
        const mask96 = ((1n << 128n) - 1n) ^ ((1n << 32n) - 1n);
        if ((n & mask96) === (base & mask96)) {
          const v4big = n & 0xffffffffn;
          return { mode: "nat64-custom", ipv4: numToIp(Number(v4big)) };
        }
      }
    } catch (_) { /* invalid custom prefix, ignore */ }
  }

  // Well-known /96 prefixes
  const wkPrefixes = [
    { mode: "ipv4-mapped", base: ipToBigint("::ffff:0:0") },
    { mode: "nat64-wk",    base: ipToBigint("64:ff9b::") },
  ];
  const mask96 = ((1n << 128n) - 1n) ^ ((1n << 32n) - 1n);
  for (const wk of wkPrefixes) {
    if ((n & mask96) === (wk.base & mask96)) {
      const v4big = n & 0xffffffffn;
      if (v4big !== 0n) {
        return { mode: wk.mode, ipv4: numToIp(Number(v4big)) };
      }
    }
  }

  // IPv4-compatible (::/96): top 96 bits must be exactly zero and lower 32 non-zero.
  // Checked separately to avoid false positives (e.g. ::1 has top 96 bits zero but
  // is the loopback address, not an IPv4-compatible address).
  if (n >> 32n === 0n && (n & 0xffffffffn) !== 0n) {
    return { mode: "ipv4-compatible", ipv4: numToIp(Number(n & 0xffffffffn)) };
  }

  return null;
}

/**
 * Generate a bit-layout descriptor showing where the IPv4 octets land
 * in the 8 × 16-bit IPv6 words.
 * @param {string} mode
 * @param {string} [customPrefix]
 * @returns {Array<{word:number, label:string, type:"prefix"|"ipv4"|"zero"}>}
 */
export function bitLayout(mode) {
  // 8 words (indices 0–7, word 0 = most significant)
  const words = Array.from({ length: 8 }, (_, i) => ({
    word: i,
    label: `word${i}`,
    type: "zero",
  }));

  if (mode === "6to4") {
    words[0] = { word: 0, label: "0x2002", type: "prefix" };
    words[1] = { word: 1, label: "v4[0–1]", type: "ipv4" };
    words[2] = { word: 2, label: "v4[2–3]", type: "ipv4" };
    return words;
  }

  // /96 modes: top 6 words are prefix, bottom 2 are IPv4
  const prefixWords = mode === "ipv4-compatible" ? 0 : 6;
  for (let i = 0; i < prefixWords; i++) {
    words[i] = { word: i, label: `prefix[${i}]`, type: "prefix" };
  }
  words[6] = { word: 6, label: "v4[0–1]", type: "ipv4" };
  words[7] = { word: 7, label: "v4[2–3]", type: "ipv4" };
  return words;
}
