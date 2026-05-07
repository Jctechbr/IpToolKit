/**
 * Reverse DNS zone names and BIND-format headers for IPv4 and IPv6 prefixes.
 */
import { parseCidr as parseV4, networkAddress as netV4, numToIp } from "./ipv4.js";
import { parseCidr as parseV6, networkAddress as netV6, ipToBigint, expand } from "./ipv6.js";

/**
 * Generate reverse DNS zone info for an IPv4 prefix.
 * @param {string} cidr e.g. "10.0.0.0/24"
 * @returns {{zoneName:string, origin:string, note:string}}
 */
export function reverseV4(cidr) {
  const { ip, prefix } = parseV4(cidr);
  const net = netV4({ ip, prefix });
  const octets = [
    (net >>> 24) & 0xff,
    (net >>> 16) & 0xff,
    (net >>> 8) & 0xff,
    net & 0xff,
  ];

  let zoneName, note;
  if (prefix === 0) {
    zoneName = "in-addr.arpa";
    note = "Covers the entire IPv4 address space";
  } else if (prefix <= 8) {
    zoneName = `${octets[0]}.in-addr.arpa`;
    note = prefix < 8 ? `Classless /in-addr.arpa delegation may be needed for /${prefix}` : "";
  } else if (prefix <= 16) {
    zoneName = `${octets[1]}.${octets[0]}.in-addr.arpa`;
    note = prefix < 16 ? `Classless delegation needed for /${prefix}` : "";
  } else if (prefix <= 24) {
    zoneName = `${octets[2]}.${octets[1]}.${octets[0]}.in-addr.arpa`;
    note = prefix < 24 ? `Classless delegation needed for /${prefix} (RFC2317)` : "";
  } else {
    // /25–/32: classless delegation per RFC2317
    const block = `${octets[3]}/${prefix}`;
    zoneName = `${block}.${octets[2]}.${octets[1]}.${octets[0]}.in-addr.arpa`;
    note = "Classless in-addr.arpa delegation (RFC2317)";
  }

  return {
    zoneName,
    origin: `$ORIGIN ${zoneName}.`,
    note,
  };
}

/**
 * Generate reverse DNS zone info for an IPv6 prefix.
 * Zone names are nibble-based, aligned to 4-bit boundaries per RFC3596/RFC4291.
 * @param {string} cidr e.g. "2001:db8::/32"
 * @returns {{zoneName:string, origin:string, note:string}}
 */
export function reverseV6(cidr) {
  const idx = cidr.lastIndexOf("/");
  const ip = cidr.slice(0, idx);
  const prefix = parseInt(cidr.slice(idx + 1), 10);
  const net = netV6(ip, prefix);
  const n = ipToBigint(net);

  // Guard: /0 covers the entire IPv6 space
  if (prefix === 0) {
    return { zoneName: "ip6.arpa", origin: "$ORIGIN ip6.arpa.", note: "Covers the entire IPv6 address space" };
  }

  // Full 32-nibble representation
  const hex = n.toString(16).padStart(32, "0");
  // Reverse nibble zone = nibbles in reverse order, up to prefix/4 nibbles
  const nibbleCount = Math.floor(prefix / 4);
  const zoneNibbles = hex.slice(0, nibbleCount).split("").reverse().join(".");
  const zoneName = `${zoneNibbles}.ip6.arpa`;

  let note = "";
  if (prefix % 4 !== 0) {
    note = `Prefix /${prefix} is not on a nibble boundary — zone covers /${nibbleCount * 4}. Consider delegating on nibble boundary.`;
  }

  return {
    zoneName,
    origin: `$ORIGIN ${zoneName}.`,
    note,
  };
}

/**
 * Auto-detect family and return reverse DNS info.
 * @param {string} cidr
 * @returns {{zoneName:string, origin:string, note:string}}
 */
export function reverseDns(cidr) {
  return cidr.includes(":") ? reverseV6(cidr) : reverseV4(cidr);
}
